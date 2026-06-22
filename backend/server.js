// =====================
// IMPORTS
// =====================
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const PDFDocument = require("pdfkit");
require("dotenv").config();
const path = require("path");

const User = require("./models/User");
const Student = require("./models/Student");
const Course = require("./models/Course");
const Assignment = require("./models/Assignment");
const Certificate = require("./models/Certificate");
const Enrollment = require("./models/Enrollment");

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "secretkey";

app.use(cors());
app.use(express.json());
app.use(
    express.static(
        path.join(__dirname, "../frontend")
    )
);
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB Connected"))
    .catch((err) => console.log("❌ MongoDB Connection Error:", err.message));

console.log("🔥 LMS Backend Starting...");

// =====================
// AUTH MIDDLEWARE
// =====================
function verifyToken(req, res, next) {

    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(403).json({ message: "No Token Provided" });
    }

    const token = authHeader.split(" ")[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch {
        return res.status(401).json({ message: "Invalid or Expired Token" });
    }
}

function verifyAdmin(req, res, next) {
    if (req.user?.role !== "admin") {
        return res.status(403).json({ message: "Admin Access Required" });
    }
    next();
}

// =====================
// AUTH: SIGNUP / LOGIN
// =====================

// One-time admin bootstrap (safe to call repeatedly)
app.get("/create-admin", async (req, res) => {
    try {
        const existingAdmin = await User.findOne({ email: "admin@lms.com" });

        if (existingAdmin) {
            return res.json({ message: "Admin Already Exists" });
        }

        const hashedPassword = await bcrypt.hash("1234", 10);

        const admin = await User.create({
            name: "Velmurugan",
            email: "admin@lms.com",
            password: hashedPassword,
            role: "admin"
        });

        res.json({ message: "Admin Created Successfully", admin });

    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Server Error" });
    }
});

// Public signup — anyone can register as a student.
// Admin accounts are never created from this endpoint.
app.post("/signup", async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ message: "All fields are required" });
        }

        if (password.length < 4) {
            return res.status(400).json({ message: "Password must be at least 4 characters" });
        }

        const existingUser = await User.findOne({ email });

        if (existingUser) {
            return res.status(400).json({ message: "An account with this email already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await User.create({
            name,
            email,
            password: hashedPassword,
            role: "student"
        });

        // Mirror a Student record so admin tools (students.html) see them too
        const existingStudent = await Student.findOne({ email });
        if (!existingStudent) {
            await Student.create({
                name,
                email,
                course: "",
                user: user._id
            });
        }

        const token = jwt.sign(
            { id: user._id, role: user.role },
            JWT_SECRET,
            { expiresIn: "12h" }
        );

        res.json({
            message: "Account Created Successfully",
            token,
            user: { name: user.name, email: user.email, role: user.role }
        });

    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Server Error" });
    }
});

app.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });

        if (!user) {
            return res.status(401).json({ message: "Invalid Credentials" });
        }

        const match = await bcrypt.compare(password, user.password);

        if (!match) {
            return res.status(401).json({ message: "Invalid Credentials" });
        }

        const token = jwt.sign(
            { id: user._id, role: user.role },
            JWT_SECRET,
            { expiresIn: "12h" }
        );

        res.json({
            message: "Login Successful",
            token,
            user: { name: user.name, email: user.email, role: user.role }
        });

    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Server Error" });
    }
});

app.get("/dashboard", verifyToken, (req, res) => {
    res.json({ message: "Welcome To Dashboard", user: req.user });
});

// Logged-in user updates their own name / email / password.
// Mirrors an email change onto the Student record and any historical
// Assignment/Certificate rows (matched by old email) so a student's
// past work stays linked to them after they change their email.
app.put("/update-profile", verifyToken, async (req, res) => {
    try {
        const { name, email, currentPassword, newPassword, department, phone, skills } = req.body;

        const user = await User.findById(req.user.id);

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const oldEmail = user.email;

        if (name && name.trim()) {
            user.name = name.trim();
        }

        if (email && email.trim() && email.trim() !== oldEmail) {
            const newEmail = email.trim();

            const emailTaken = await User.findOne({ email: newEmail, _id: { $ne: user._id } });
            if (emailTaken) {
                return res.status(400).json({ message: "That email is already in use" });
            }

            user.email = newEmail;
        }

        if (newPassword) {
            if (!currentPassword) {
                return res.status(400).json({ message: "Enter your current password to set a new one" });
            }

            const match = await bcrypt.compare(currentPassword, user.password);
            if (!match) {
                return res.status(401).json({ message: "Current password is incorrect" });
            }

            if (newPassword.length < 4) {
                return res.status(400).json({ message: "New password must be at least 4 characters" });
            }

            user.password = await bcrypt.hash(newPassword, 10);
        }

        await user.save();

        // Keep the Student directory record and history in sync.
        const studentUpdate = { name: user.name };

        if (department !== undefined) studentUpdate.department = department;
        if (phone !== undefined) studentUpdate.phone = phone;
        if (skills !== undefined) studentUpdate.skills = skills;

        if (user.email !== oldEmail) {
            studentUpdate.email = user.email;
            await Student.updateOne({ email: oldEmail }, studentUpdate);
            await Assignment.updateMany({ studentEmail: oldEmail }, { studentEmail: user.email });
            await Certificate.updateMany({ studentEmail: oldEmail }, { studentEmail: user.email });
        } else {
            await Student.updateOne({ email: oldEmail }, studentUpdate);
        }

        // Issue a fresh token since the email (used in the payload-adjacent
        // lookups elsewhere) may have changed.
        const token = jwt.sign(
            { id: user._id, role: user.role },
            JWT_SECRET,
            { expiresIn: "12h" }
        );

        res.json({
            message: "Profile updated successfully",
            token,
            user: { name: user.name, email: user.email, role: user.role }
        });

    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Server Error" });
    }
});

// =====================
// STUDENTS
// =====================

app.post("/add-student", verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { name, email, course } = req.body;

        if (!name || !email) {
            return res.status(400).json({ message: "Name and email are required" });
        }

        const existing = await Student.findOne({ email });
        if (existing) {
            return res.status(400).json({ message: "A student with this email already exists" });
        }

        const student = await Student.create({ name, email, course: course || "" });

        res.json({ message: "Student Added Successfully", student });

    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Error Adding Student" });
    }
});

app.get("/students", async (req, res) => {
    try {
        const students = await Student.find().sort({ name: 1 });
        res.json(students);
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Server Error" });
    }
});

// A student fetches their own extra profile fields (department, phone,
// skills) — separate from /students (the admin directory listing) so a
// student only ever pulls their own record.
app.get("/my-profile/:email", verifyToken, async (req, res) => {
    try {
        const student = await Student.findOne({ email: req.params.email });

        if (!student) {
            return res.json({ department: "", phone: "", skills: "" });
        }

        res.json({
            department: student.department || "",
            phone: student.phone || "",
            skills: student.skills || ""
        });

    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Server Error" });
    }
});

app.delete("/student/:id", verifyToken, verifyAdmin, async (req, res) => {
    try {
        await Student.findByIdAndDelete(req.params.id);
        await Enrollment.deleteMany({ student: req.params.id });
        res.json({ message: "Student Deleted" });
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Server Error" });
    }
});

// =====================
// COURSES
// =====================

app.post("/add-course", verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { title, instructor, modules, pdfUrl } = req.body;

        if (!title || !instructor) {
            return res.status(400).json({ message: "Title and Instructor required" });
        }

        let cleanPdfUrl = "";
        if (pdfUrl && pdfUrl.trim()) {
            const trimmed = pdfUrl.trim();
            if (!/^https?:\/\//i.test(trimmed)) {
                return res.status(400).json({ message: "PDF link must start with http:// or https://" });
            }
            cleanPdfUrl = trimmed;
        }

        const course = await Course.create({
            title,
            instructor,
            progress: 0,
            pdfUrl: cleanPdfUrl,
            modules: Array.isArray(modules) ? modules : []
        });

        res.json({ message: "Course Added Successfully", course });

    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Error Adding Course" });
    }
});

app.get("/courses", async (req, res) => {
    try {
        const { studentEmail } = req.query;

        // No studentEmail = admin/management view: every course exists.
        if (!studentEmail) {
            const courses = await Course.find().sort({ title: 1 });
            return res.json(courses);
        }

        // studentEmail present = student view: ONLY courses they're
        // actually enrolled in. A brand-new student with no enrollments
        // sees an empty list until an admin assigns them a course.
        const student = await Student.findOne({ email: studentEmail });

        if (!student) {
            return res.json([]);
        }

        const enrollments = await Enrollment.find({ student: student._id })
            .populate("course");

        const result = enrollments
            .filter(e => e.course) // skip if the course was deleted
            .map(e => ({
                ...e.course.toObject(),
                myProgress: e.progress,
                enrollmentId: e._id
            }));

        res.json(result);

    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Server Error" });
    }
});

app.get("/course/:id", async (req, res) => {
    try {
        const course = await Course.findById(req.params.id);

        if (!course) {
            return res.status(404).json({ message: "Course Not Found" });
        }

        const result = course.toObject();
        const { studentEmail } = req.query;

        // No studentEmail = admin/management lookup, allow it through.
        if (!studentEmail) {
            return res.json(result);
        }

        // studentEmail present = a student is viewing this course page.
        // They must be enrolled — only an admin can assign a course.
        const student = await Student.findOne({ email: studentEmail });

        if (!student) {
            return res.status(403).json({ message: "Student record not found" });
        }

        const enrollment = await Enrollment.findOne({
            student: student._id,
            course: course._id
        });

        if (!enrollment) {
            return res.status(403).json({
                message: "You're not enrolled in this course. Ask an admin to assign it to you."
            });
        }

        result.myProgress = enrollment.progress;
        result.enrollmentId = enrollment._id;
        result.pdfReadAt = enrollment.pdfReadAt;

        res.json(result);
    } catch (err) {
        res.status(500).json({ message: "Server Error" });
    }
});

app.delete("/course/:id", verifyToken, verifyAdmin, async (req, res) => {
    try {
        await Course.findByIdAndDelete(req.params.id);
        await Enrollment.deleteMany({ course: req.params.id });
        res.json({ message: "Course Deleted" });
    } catch (err) {
        res.status(500).json({ message: "Server Error" });
    }
});

// =====================
// ENROLLMENTS
// =====================

app.post("/enroll", verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { studentId, courseId } = req.body;

        if (!studentId || !courseId) {
            return res.status(400).json({ message: "Student and Course are required" });
        }

        const existing = await Enrollment.findOne({ student: studentId, course: courseId });
        if (existing) {
            return res.status(400).json({ message: "Student is already enrolled in this course" });
        }

        const enrollment = await Enrollment.create({ student: studentId, course: courseId });

        res.json({ message: "Student Enrolled Successfully", enrollment });

    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Error Enrolling Student" });
    }
});

app.get("/enrollments", async (req, res) => {
    try {
        const enrollments = await Enrollment.find()
            .populate("student", "name email")
            .populate("course", "title")
            .sort({ enrolledAt: -1 });

        const result = enrollments.map(e => ({
            _id: e._id,
            studentName: e.student?.name || "Unknown Student",
            courseTitle: e.course?.title || "Unknown Course",
            progress: e.progress
        }));

        res.json(result);

    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Server Error" });
    }
});

// Same as /enrollments but also flags whether a certificate has already
// been issued for that student + course. Used by the admin certificate
// eligibility panel.
app.get("/enrollments-detailed", verifyToken, verifyAdmin, async (req, res) => {
    try {
        const enrollments = await Enrollment.find()
            .populate("student", "name email")
            .populate("course", "title")
            .sort({ enrolledAt: -1 });

        const certificates = await Certificate.find();

        const issuedSet = new Set(
            certificates.map(c => `${c.studentEmail}::${c.course}`)
        );

        const result = enrollments.map(e => {
            const studentEmail = e.student?.email || "";
            const courseTitle = e.course?.title || "Unknown Course";

            return {
                _id: e._id,
                studentName: e.student?.name || "Unknown Student",
                studentEmail,
                courseTitle,
                progress: e.progress,
                certificateIssued: issuedSet.has(`${studentEmail}::${courseTitle}`)
            };
        });

        res.json(result);

    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Server Error" });
    }
});

// Student marks a course's PDF as read — sets their personal progress
// for that course to 100%. Requires an existing enrollment: students
// cannot self-enroll just by opening a course's PDF — only an admin
// can assign a course to a student.
app.post("/mark-pdf-read", async (req, res) => {
    try {
        const { studentEmail, courseId } = req.body;

        if (!studentEmail || !courseId) {
            return res.status(400).json({ message: "studentEmail and courseId are required" });
        }

        const student = await Student.findOne({ email: studentEmail });

        if (!student) {
            return res.status(404).json({ message: "Student record not found" });
        }

        const enrollment = await Enrollment.findOne({ student: student._id, course: courseId });

        if (!enrollment) {
            return res.status(403).json({
                message: "You're not enrolled in this course. Ask an admin to assign it to you."
            });
        }

        enrollment.progress = 100;
        enrollment.pdfReadAt = new Date();
        await enrollment.save();

        res.json({ message: "Marked as read — progress updated", progress: enrollment.progress });

    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Server Error" });
    }
});

// =====================
// ASSIGNMENTS
// =====================

app.post("/submit-assignment", async (req, res) => {
    try {
        const { studentName, studentEmail, courseTitle, assignment } = req.body;

        if (!studentName || !assignment) {
            return res.status(400).json({ message: "Student name and assignment are required" });
        }

        const newSubmission = await Assignment.create({
            studentName,
            studentEmail: studentEmail || "",
            courseTitle: courseTitle || "",
            assignment
        });

        res.json({
            message: "Assignment Submitted Successfully",
            submission: newSubmission
        });

    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Submission Failed" });
    }
});

app.get("/assignments", async (req, res) => {
    try {
        const assignments = await Assignment.find().sort({ submittedAt: -1 });
        res.json(assignments);
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Server Error" });
    }
});

// Assignments submitted by one specific student (used by student dashboard)
app.get("/my-assignments/:email", async (req, res) => {
    try {
        const assignments = await Assignment.find({ studentEmail: req.params.email })
            .sort({ submittedAt: -1 });
        res.json(assignments);
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Server Error" });
    }
});

app.put("/assignment/:id/grade", verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { marks } = req.body;

        let grade = "F";
        if (marks >= 90) grade = "A+";
        else if (marks >= 80) grade = "A";
        else if (marks >= 70) grade = "B";
        else if (marks >= 60) grade = "C";
        else if (marks >= 50) grade = "D";

        const updatedAssignment = await Assignment.findByIdAndUpdate(
            req.params.id,
            { marks, grade },
            { new: true }
        );

        res.json({ message: "Marks Updated", assignment: updatedAssignment });

    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Server Error" });
    }
});

// =====================
// CERTIFICATES
// =====================

// Minimum course progress (%) required before a certificate can be issued.
const PASSING_PROGRESS = 50;

app.post("/issue-certificate", verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { enrollmentId, grade } = req.body;

        if (!enrollmentId) {
            return res.status(400).json({ message: "enrollmentId is required" });
        }

        const enrollment = await Enrollment.findById(enrollmentId)
            .populate("student", "name email")
            .populate("course", "title");

        if (!enrollment) {
            return res.status(404).json({ message: "Enrollment Not Found" });
        }

        if (enrollment.progress < PASSING_PROGRESS) {
            return res.status(400).json({
                message: `Student has only ${enrollment.progress}% progress (needs ${PASSING_PROGRESS}%+) — not eligible for a certificate yet.`
            });
        }

        const studentName = enrollment.student?.name;
        const studentEmail = enrollment.student?.email;
        const courseTitle = enrollment.course?.title;

        if (!studentName || !courseTitle) {
            return res.status(400).json({ message: "Could not resolve student or course for this enrollment" });
        }

        // Prevent issuing the same certificate twice for the same student + course.
        const existing = await Certificate.findOne({ studentEmail, course: courseTitle });

        if (existing) {
            return res.status(400).json({
                message: "A certificate has already been issued for this student and course."
            });
        }

        const certificate = await Certificate.create({
            studentName,
            studentEmail: studentEmail || "",
            course: courseTitle,
            grade: grade || "Completed"
        });

        res.json({ message: "Certificate Issued Successfully", certificate });

    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Server Error" });
    }
});

app.get("/certificates", async (req, res) => {
    try {
        const certificates = await Certificate.find().sort({ issuedDate: -1 });
        res.json(certificates);
    } catch (err) {
        res.status(500).json({ message: "Server Error" });
    }
});

// Certificates earned by one specific student (used by student dashboard)
app.get("/my-certificates/:email", async (req, res) => {
    try {
        const certificates = await Certificate.find({ studentEmail: req.params.email })
            .sort({ issuedDate: -1 });
        res.json(certificates);
    } catch (err) {
        res.status(500).json({ message: "Server Error" });
    }
});

// Generate a nicely designed certificate PDF for a given certificate id
app.get("/certificate/:id", async (req, res) => {
    try {
        const certificate = await Certificate.findById(req.params.id);

        if (!certificate) {
            return res.status(404).json({ message: "Certificate Not Found" });
        }

        const doc = new PDFDocument({
            layout: "landscape",
            size: "A4",
            margin: 0
        });

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
            "Content-Disposition",
            `inline; filename="certificate-${certificate._id}.pdf"`
        );

        doc.pipe(res);

        const pageWidth = doc.page.width;
        const pageHeight = doc.page.height;

        // Background
        doc.rect(0, 0, pageWidth, pageHeight).fill("#0f172a");

        // Outer decorative border
        const borderMargin = 28;
        doc.lineWidth(2)
           .strokeColor("#6366f1")
           .rect(
               borderMargin,
               borderMargin,
               pageWidth - borderMargin * 2,
               pageHeight - borderMargin * 2
           )
           .stroke();

        const innerMargin = 40;
        doc.lineWidth(0.75)
           .strokeColor("#8b5cf6")
           .rect(
               innerMargin,
               innerMargin,
               pageWidth - innerMargin * 2,
               pageHeight - innerMargin * 2
           )
           .stroke();

        // Corner accents
        const accentColor = "#06b6d4";
        [
            [innerMargin, innerMargin],
            [pageWidth - innerMargin, innerMargin],
            [innerMargin, pageHeight - innerMargin],
            [pageWidth - innerMargin, pageHeight - innerMargin]
        ].forEach(([x, y]) => {
            doc.circle(x, y, 4).fill(accentColor);
        });

        // Eyebrow label
        doc.fillColor("#8b5cf6")
           .font("Helvetica-Bold")
           .fontSize(13)
           .text("EDUMASTER LMS", 0, 78, { align: "center", characterSpacing: 3 });

        // Title
        doc.fillColor("#ffffff")
           .font("Helvetica-Bold")
           .fontSize(36)
           .text("CERTIFICATE OF COMPLETION", 0, 105, { align: "center" });

        // Divider
        const dividerY = 160;
        const dividerWidth = 140;
        doc.moveTo(pageWidth / 2 - dividerWidth / 2, dividerY)
           .lineTo(pageWidth / 2 + dividerWidth / 2, dividerY)
           .lineWidth(1.5)
           .strokeColor("#6366f1")
           .stroke();

        // "This certifies that"
        doc.fillColor("#cbd5e1")
           .font("Helvetica")
           .fontSize(14)
           .text("This certifies that", 0, 188, { align: "center" });

        // Student name — the hero element
        doc.fillColor("#06b6d4")
           .font("Helvetica-Bold")
           .fontSize(40)
           .text(certificate.studentName, 0, 212, { align: "center" });

        // "has successfully completed"
        doc.fillColor("#cbd5e1")
           .font("Helvetica")
           .fontSize(14)
           .text("has successfully completed the course", 0, 268, { align: "center" });

        // Course title
        doc.fillColor("#ffffff")
           .font("Helvetica-Bold")
           .fontSize(26)
           .text(certificate.course, 0, 292, { align: "center" });

        // Grade badge
        doc.fillColor("#facc15")
           .font("Helvetica-Bold")
           .fontSize(15)
           .text(`Grade Achieved: ${certificate.grade}`, 0, 336, { align: "center" });

        // Footer: date + certificate ID, split left/right
        const footerY = pageHeight - 90;
        const issuedDate = new Date(certificate.issuedDate).toLocaleDateString("en-IN", {
            day: "numeric", month: "long", year: "numeric"
        });

        doc.fillColor("#94a3b8")
           .font("Helvetica")
           .fontSize(10)
           .text("DATE ISSUED", 90, footerY, { width: 200, align: "left" });
        doc.fillColor("#e2e8f0")
           .font("Helvetica-Bold")
           .fontSize(12)
           .text(issuedDate, 90, footerY + 14, { width: 200, align: "left" });

        doc.fillColor("#94a3b8")
           .font("Helvetica")
           .fontSize(10)
           .text("CERTIFICATE ID", pageWidth - 290, footerY, { width: 200, align: "right" });
        doc.fillColor("#e2e8f0")
           .font("Helvetica-Bold")
           .fontSize(12)
           .text(String(certificate._id), pageWidth - 290, footerY + 14, { width: 200, align: "right" });

        doc.end();

    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Could Not Generate Certificate" });
    }
});

// =====================
// ATTENDANCE
// =====================
// Lightweight mock data (attendance hardware/biometric integration is
// out of scope for this mini-project).
app.get("/attendance", (req, res) => {
    res.json({
        percentage: 95,
        presentDays: 57,
        absentDays: 3,
        records: [
            { date: "2026-06-15", status: "Present" },
            { date: "2026-06-16", status: "Present" },
            { date: "2026-06-17", status: "Absent" },
            { date: "2026-06-18", status: "Present" },
            { date: "2026-06-19", status: "Present" },
            { date: "2026-06-20", status: "Present" }
        ]
    });
});

// =====================
// STATS (admin + student dashboards)
// =====================

app.get("/stats", async (req, res) => {
    try {
        const { studentEmail } = req.query;

        if (studentEmail) {
            const student = await Student.findOne({ email: studentEmail });

            const courses = student
                ? await Enrollment.countDocuments({ student: student._id })
                : 0;

            const assignments = await Assignment.countDocuments({ studentEmail });
            const certificates = await Certificate.countDocuments({ studentEmail });

            return res.json({
                courses,
                attendance: 95,
                assignments,
                certificates
            });
        }

        const courses = await Course.countDocuments();
        const students = await Student.countDocuments();
        const assignments = await Assignment.countDocuments();
        const certificates = await Certificate.countDocuments();

        res.json({
            courses,
            students,
            attendance: 95,
            assignments,
            certificates
        });

    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Server Error" });
    }
});

// =====================
// TEST ROUTE
// =====================

app.get("/test", (req, res) => {
    res.send("TEST ROUTE WORKING");
});

// =====================
// SERVER START
// =====================

app.listen(PORT, () => {
    console.log(`🚀 Server Running On Port ${PORT}`);
});
app.get("/", (req, res) => {

    res.sendFile(
        path.join(
            __dirname,
            "../frontend/login.html"
        )
    );

});
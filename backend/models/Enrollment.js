const mongoose = require("mongoose");

const enrollmentSchema = new mongoose.Schema({

    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Student",
        required: true
    },

    course: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Course",
        required: true
    },

    enrolledAt: {
        type: Date,
        default: Date.now
    },

    progress: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
    },

    pdfReadAt: {
        type: Date,
        default: null
    }

});

module.exports =
    mongoose.model("Enrollment", enrollmentSchema);

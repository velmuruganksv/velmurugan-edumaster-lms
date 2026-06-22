const mongoose = require("mongoose");

const assignmentSchema = new mongoose.Schema({

    studentName: {
        type: String,
        required: true
    },

    studentEmail: {
        type: String,
        default: ""
    },

    courseTitle: {
        type: String,
        default: ""
    },

    assignment: {
        type: String,
        required: true
    },

    marks: {
        type: Number,
        default: 0
    },

    grade: {
        type: String,
        default: "Pending"
    },

    submittedAt: {
        type: Date,
        default: Date.now
    }

});

module.exports =
    mongoose.model(
        "Assignment",
        assignmentSchema
    );
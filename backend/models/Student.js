const mongoose = require("mongoose");

const studentSchema = new mongoose.Schema({

    name: {
        type: String,
        required: true
    },

    email: {
        type: String,
        required: true,
        unique: true
    },

    course: {
        type: String,
        default: ""
    },

    department: {
        type: String,
        default: ""
    },

    phone: {
        type: String,
        default: ""
    },

    skills: {
        type: String,
        default: ""
    },

    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    }

});

module.exports =
    mongoose.model("Student", studentSchema);
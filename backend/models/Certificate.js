const mongoose = require("mongoose");

const certificateSchema = new mongoose.Schema({

    studentName:{
        type:String,
        required:true
    },

    studentEmail:{
        type:String,
        default:""
    },

    course:{
        type:String,
        required:true
    },

    grade:{
        type:String,
        required:true
    },

    issuedDate:{
        type:Date,
        default:Date.now
    }

});

module.exports =
    mongoose.model(
        "Certificate",
        certificateSchema
    );
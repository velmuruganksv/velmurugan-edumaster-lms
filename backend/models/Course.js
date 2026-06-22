const mongoose = require("mongoose");

const courseSchema = new mongoose.Schema({

    title:{
        type:String,
        required:true
    },

    instructor:{
        type:String,
        required:true
    },

    progress:{
        type:Number,
        default:0
    },

    pdfUrl:{
        type:String,
        default:""
    },

    modules:[String]

});

module.exports =
    mongoose.model(
        "Course",
        courseSchema
    );
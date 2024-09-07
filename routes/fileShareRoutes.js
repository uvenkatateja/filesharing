const express = require("express");
const User = require("../models/userModel");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const multer = require("multer");
const nodemailer = require("nodemailer");
const responseFunction = require("../utils/responseFunction");
const fs = require("fs");

const errorHandler = require("../middlewares/errorMiddleware");
const authTokenHandler = require("../middlewares/checkAuthToken");
const {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const dotenv = require("dotenv");
dotenv.config();

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const getObjectURL = async (key) => {
  const params = {
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: key,
  };

  return await getSignedUrl(s3Client, new GetObjectCommand(params));
};

const postObjectURL = async (filename, contentType) => {
  const params = {
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: filename,
    ContentType: contentType,
  };

  return await getSignedUrl(s3Client, new PutObjectCommand(params));
};

async function mailer(recieveremail, filesenderemail, filekey) {
  let transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    requireTLS: true,
    auth: {
      user: "datakixx@gmail.com", // Replace with your email
      pass: "cvmg slkv plix ntvu", // Replace with your email password or app password
    },
  });

  // Generate a signed URL for the file
  const fileUrl = await getObjectURL(filekey);

  let info = await transporter.sendMail({
    from: "Team DATA <datakixx@gmail.com>", // Replace with your email
    to: recieveremail,
    subject: "New File Shared",
    html: `
      <div style="background-color: black; color: white; padding: 20px; border-radius: 10px; max-width: 600px; margin: auto;">
       
        
        <p style="font-size: 18px; text-align: center;">You received a new file from <strong>${filesenderemail}</strong></p>
        <p style="font-size: 18px; text-align: center;">Click <a href="${fileUrl}" style="color: #1E90FF;">here</a> to view the file.</p>
      </div>
    `,
  });

  console.log("Message sent: %s", info.messageId);
  console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
}

router.get("/test", async (req, res) => {
  let imgurl = await getObjectURL("myfile803");
  res.send('<img src="' + imgurl + '"/>');
});

router.get(
  "/generatepostobjecturl",
  authTokenHandler,
  async (req, res, next) => {
    try {
      const timeinms = new Date().getTime();
      const signedUrl = await postObjectURL(timeinms.toString(), "");
      return responseFunction(
        res,
        200,
        "Signed URL generated",
        {
          signedUrl: signedUrl,
          filekey: timeinms.toString(),
        },
        true
      );
    } catch (err) {
      next(err);
    }
  }
);

router.post("/sharefile", authTokenHandler, async (req, res, next) => {
  try {
    const { receiveremail, filename, filekey, fileType } = req.body;

    let senderuser = await User.findOne({ _id: req.userId });
    let recieveruser = await User.findOne({
      email: receiveremail,
    });

    if (!senderuser) {
      return responseFunction(
        res,
        400,
        "Sender email is not registered",
        null,
        false
      );
    }

    if (!recieveruser) {
      return responseFunction(
        res,
        400,
        "Receiver email is not registered",
        null,
        false
      );
    }

    if (senderuser.email === receiveremail) {
      return responseFunction(
        res,
        400,
        "Receiver email cannot be the same as sender",
        null,
        false
      );
    }

    senderuser.files.push({
      senderemail: senderuser.email,
      receiveremail: receiveremail,
      fileurl: filekey,
      fileType: fileType,
      filename: filename ? filename : new Date().toLocaleDateString(),
      sharedAt: Date.now(),
    });

    recieveruser.files.push({
      senderemail: senderuser.email,
      receiveremail: receiveremail,
      fileurl: filekey,
      fileType: fileType,
      filename: filename ? filename : new Date().toLocaleDateString(),
      sharedAt: Date.now(),
    });

    await senderuser.save();
    await recieveruser.save();
    await mailer(receiveremail, senderuser.email, filekey);

    return responseFunction(res, 200, "Shared successfully", null, true);
  } catch (err) {
    next(err);
  }
});

router.get("/getfiles", authTokenHandler, async (req, res, next) => {
  try {
    let user = await User.findOne({ _id: req.userId });
    if (!user) {
      return responseFunction(res, 400, "User not found", null, false);
    }
    return responseFunction(
      res,
      200,
      "Files fetched successfully",
      user.files,
      true
    );
  } catch (err) {
    next(err);
  }
});

router.get("/gets3urlbykey/:key", authTokenHandler, async (req, res, next) => {
  try {
    const { key } = req.params;
    const signedUrl = await getObjectURL(key);
    if (!signedUrl) {
      return responseFunction(res, 400, "Signed URL not found", null, false);
    }
    return responseFunction(
      res,
      200,
      "Signed URL generated",
      {
        signedUrl: signedUrl,
      },
      true
    );
  } catch (err) {
    next(err);
  }
});

router.use(errorHandler);
module.exports = router;

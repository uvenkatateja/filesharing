const express = require("express");
const User = require("../models/userModel");
const Verification = require("../models/verificationModel");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const nodemailer = require("nodemailer");
const responseFunction = require("../utils/responseFunction");
const fs = require("fs");
const errorHandler = require("../middlewares/errorMiddleware");
const authTokenHandler = require("../middlewares/checkAuthToken");

async function mailer(recieveremail, code) {
  let transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    requireTLS: true,
    auth: {
      user: "datakixx@gmail.com",
      pass: "cvmg slkv plix ntvu",
    },
  });

  let info = await transporter.sendMail({
    from: "Teams DATA <datakixx@gmail.com> ",
    to: recieveremail,
    subject: "OTP for verification",
    html: `
      <div style="max-width: 600px; margin: auto; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; font-family: Arial, sans-serif; background-color: #f9f9f9;">
        <div style="background-color: #001529; color: #fff; padding: 20px; text-align: center;">
         
          <h1 style="margin: 0;">D A T A</h1>
        </div>
        <div style="padding: 20px; text-align: center;">
          <h2 style="font-size: 24px; margin: 0;">Your OTP Code</h2>
          <p style="font-size: 20px; font-weight: bold; color: #333;">${code}</p>
          <p style="color: #666;">This code will expire in 10 minutes.</p>
        </div>
        <div style="background-color: #001529; color: #fff; padding: 10px; text-align: center;">
          <p style="margin: 0;">© 2024 DATA. All rights reserved.</p>
        </div>
      </div>
    `,
  });

  console.log("Message sent: %s", info.messageId);
  console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
}

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "./public");
  },
  filename: (req, file, cb) => {
    let fileType = file.mimetype.split("/")[1];
    console.log(req.headers.filename);
    cb(null, `${Date.now()}.${fileType}`);
  },
});
const upload = multer({ storage: storage });

// Middleware for file upload
const fileUploadFunction = (req, res, next) => {
  upload.single("clientfile")(req, res, (err) => {
    if (err) {
      return responseFunction(res, 400, "File upload failed", null, false);
    }
    next();
  });
};

// Routes
router.get("/test", (req, res) => {
  res.send("Auth routes are working");
  // mailer("codershub.2430@gmail.com", 12345);
});

router.post("/sendotp", async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return responseFunction(res, 400, "Email is required", null, false);
  }
  try {
    await Verification.deleteOne({ email: email });

    const code = Math.floor(100000 + Math.random() * 900000);
    await mailer(email, code);
    // await Verification.findOneAndDelete({ email: email });
    const newVerification = new Verification({
      email: email,
      code: code,
    });
    await newVerification.save();
    return responseFunction(res, 200, "OTP sent successfully", null, true);
  } catch (err) {
    console.log(err);
    return responseFunction(res, 500, "Internal server error", null, false);
  }
});

router.post("/register", fileUploadFunction, async (req, res, next) => {
  try {
    const { name, email, password, otp, profilePic } = req.body;
    let user = await User.findOne({ email: email });
    let verificationQueue = await Verification.findOne({ email: email });
    if (user) {
      return responseFunction(res, 400, "User already exists", null, false);
    }

    if (!verificationQueue) {
      return responseFunction(res, 400, "Please send otp first", null, false);
    }

    const isMatch = await bcrypt.compare(otp, verificationQueue.code);
    if (!isMatch) {
      return responseFunction(res, 400, "Invalid OTP", null, false);
    }

    user = new User({
      name: name,
      email: email,
      password: password,
      profilePic: profilePic,
    });
    await user.save();
    await Verification.deleteOne({ email: email });
    return responseFunction(res, 200, "Registered successfully", null, true);
  } catch (err) {
    console.log(err);
    return responseFunction(res, 500, "Internal server error", null, false);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      return responseFunction(res, 400, "Invalid credentials", null, false);
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return responseFunction(res, 400, "Invalid credentials", null, false);
    }

    const authToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET_KEY,
      { expiresIn: "10m" }
    );
    const refreshToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_REFRESH_SECRET_KEY,
      { expiresIn: "50m" }
    );

    res.cookie("authToken", authToken, {
      sameSite: "none",
      httpOnly: true,
      secure: true,
    });
    res.cookie("refreshToken", refreshToken, {
      sameSite: "none",
      httpOnly: true,
      secure: true,
    });
    return responseFunction(
      res,
      200,
      "Logged in successfully",
      {
        authToken: authToken,
        refreshToken: refreshToken,
      },
      true
    );
  } catch (err) {
    next(err);
  }
});

router.get("/checklogin", authTokenHandler, async (req, res, next) => {
  res.json({
    ok: req.ok,
    message: req.message,
    userId: req.userId,
  });
});

router.post("/logout", authTokenHandler, async (req, res, next) => {
  res.clearCookie("authToken");
  res.clearCookie("refreshToken");
  res.json({
    ok: true,
    message: "Logged out successfully",
  });
});

router.get("/getuser", authTokenHandler, async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return responseFunction(res, 400, "User not found", null, false);
    }
    return responseFunction(res, 200, "User found", user, true);
  } catch (err) {
    next(err);
  }
});

module.exports = router;

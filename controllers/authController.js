import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import User from '../models/User.js';
import { sendEmail } from '../config/email.js';
import dotenv from 'dotenv';

dotenv.config();

// ---------------- TOKEN GENERATOR ----------------
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};

// ---------------- ADMIN CREDENTIAL CHECK ----------------
const checkAdminCredentials = (username, password) => {
  const adminCreds = process.env.ADMIN_CREDENTIALS || "";
  const pairs = adminCreds.split(",").map(p => p.trim());

  return pairs.some(pair => {
    const [user, pass] = pair.split(":");
    return user === username && pass === password;
  });
};

// ---------------- LOGIN (USER / ADMIN AUTO-DETECT) ----------------
export const login = async (req, res) => {
  try {
    const { email, password, username } = req.body;

    // ========== ADMIN LOGIN ==========
    if (username && password) {
      const isValidAdmin = checkAdminCredentials(username, password);

      if (!isValidAdmin) {
        return res.status(401).json({ message: "Invalid admin credentials" });
      }

      // Return admin session without saving to database to keep DB clean
      const adminEmail = `admin-${username}@system.local`;
      const adminId = `admin-session-${Buffer.from(username).toString('hex')}`;
      const token = generateToken(adminId);

      return res.json({
        token,
        user: {
          id: adminId,
          name: `Admin ${username}`,
          email: adminEmail,
          role: "admin",
          companyName: "System Admin"
        },
      });
    }

    // ========== USER LOGIN ==========
    if (!email || !password)
      return res.status(400).json({ message: "Email & password required" });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user)
      return res.status(401).json({ message: "Email not registered" });

    const isMatch = await user.comparePassword(password);
    if (!isMatch)
      return res.status(401).json({ message: "Invalid password" });

    const token = generateToken(user._id);

    return res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        companyName: user.companyName,
        outlets: user.outlets || []
      },
    });

  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// ---------------- REGISTER ----------------
export const register = async (req, res) => {
  try {
    const { name, companyName, phone, email, password, outlets } = req.body;

    if (!name || !companyName || !phone || !email || !password || !outlets || !Array.isArray(outlets) || outlets.length === 0) {
      return res.status(400).json({ message: "Please provide all required fields" });
    }

    const existingEmail = await User.findOne({ email: email.toLowerCase() });
    if (existingEmail)
      return res.status(400).json({ message: "User already exists with this email" });

    const existingPhone = await User.findOne({ phone: phone.trim() });
    if (existingPhone)
      return res.status(400).json({ message: "User already exists with this phone number" });

    // Extract first outlet for backward compatibility if needed, or just focus on outlets
    const primaryOutlet = outlets[0];

    const user = await User.create({
      name,
      companyName,
      phone,
      email: email.toLowerCase(),
      passwordHash: password,
      address: primaryOutlet.address,
      location: {
        lat: parseFloat(primaryOutlet.lat),
        lng: parseFloat(primaryOutlet.lng)
      },
      outlets: outlets.map(o => ({
        outletName: o.outletName,
        address: o.address,
        location: {
          lat: parseFloat(o.lat !== undefined ? o.lat : o.location?.lat),
          lng: parseFloat(o.lng !== undefined ? o.lng : o.location?.lng)
        }
      }))
    });

    const token = generateToken(user._id);

    return res.status(201).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        companyName: user.companyName,
        outlets: user.outlets || []
      },
    });

  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// ---------------- CHECK AVAILABILITY ----------------
export const checkAvailability = async (req, res) => {
  try {
    const { email, phone } = req.body;

    if (email) {
      const existingEmail = await User.findOne({ email: email.toLowerCase() });
      if (existingEmail) {
        return res.status(400).json({ message: "User already exists with this email" });
      }
    }

    if (phone) {
      const existingPhone = await User.findOne({ phone: phone.trim() });
      if (existingPhone) {
        return res.status(400).json({ message: "User already exists with this phone number" });
      }
    }

    return res.status(200).json({ message: "Available" });
  } catch (err) {
    console.error("Check availability error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// ---------------- GET ME ----------------
export const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-passwordHash");
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// ---------------- UPDATE PROFILE ----------------
export const updateProfile = async (req, res) => {
  try {
    const { name, phone, companyName, address, location, outlets } = req.body;
    const userId = req.user._id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Update allowed fields (email cannot be changed)
    if (name) user.name = name;
    if (phone) {
      // Check if phone is already taken by another user
      const existingPhone = await User.findOne({ phone: phone.trim(), _id: { $ne: userId } });
      if (existingPhone) {
        return res.status(400).json({ message: "Phone number already in use" });
      }
      user.phone = phone.trim();
    }
    if (companyName) user.companyName = companyName;

    if (outlets && Array.isArray(outlets)) {
      user.outlets = outlets.map(o => ({
        outletName: o.outletName,
        address: o.address,
        location: {
          lat: parseFloat(o.lat !== undefined ? o.lat : o.location?.lat),
          lng: parseFloat(o.lng !== undefined ? o.lng : o.location?.lng)
        }
      }));

      // Sync primary address/location with first outlet if present
      if (outlets.length > 0) {
        const first = outlets[0];
        user.address = first.address;
        user.location = {
          lat: parseFloat(first.lat !== undefined ? first.lat : first.location?.lat),
          lng: parseFloat(first.lng !== undefined ? first.lng : first.location?.lng)
        };
      }
    } else {
      // Fallback to legacy address/location update if provided without outlets
      if (address) user.address = address;
      if (location && location.lat !== undefined && location.lng !== undefined) {
        user.location = {
          lat: parseFloat(location.lat),
          lng: parseFloat(location.lng)
        };
      }
    }

    await user.save();

    const updatedUser = await User.findById(userId).select("-passwordHash");
    res.json(updatedUser);
  } catch (err) {
    console.error("Update profile error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// ---------------- FORGOT PASSWORD ----------------
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    // Always return success message to prevent email enumeration
    if (!user) {
      return res.json({
        message: "If that email exists in our system, a password reset link has been sent."
      });
    }

    // Don't allow password reset for admin accounts
    if (user.role === 'admin') {
      return res.status(403).json({
        message: "Password reset is not available for admin accounts. Please contact system administrator."
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    const resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 minutes

    // Save token and expiry to user
    user.resetPasswordToken = resetPasswordToken;
    user.resetPasswordExpire = resetPasswordExpire;
    await user.save({ validateBeforeSave: false });

    // Create reset URL
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const resetUrl = `${frontendUrl}/reset-password/${resetToken}`;

    // Send email
    const subject = 'Password Reset Request - AK SecureTech Ltd';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
        <div style="background-color: white; border-radius: 8px; padding: 30px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <h2 style="color: #1f2937; margin-top: 0; border-bottom: 2px solid #3b82f6; padding-bottom: 10px;">
            Password Reset Request
          </h2>
          
          <p style="color: #4b5563; line-height: 1.6;">Dear <strong>${user.name}</strong>,</p>
          
          <p style="color: #4b5563; line-height: 1.6;">
            We received a request to reset your password. Click the button below to reset your password:
          </p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" 
               style="display: inline-block; padding: 12px 30px; background-color: #3b82f6; color: white; 
                      text-decoration: none; border-radius: 6px; font-weight: 600;">
              Reset Password
            </a>
          </div>
          
          <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
            Or copy and paste this link into your browser:
          </p>
          <p style="color: #3b82f6; font-size: 12px; word-break: break-all; background-color: #f3f4f6; 
                     padding: 10px; border-radius: 4px;">
            ${resetUrl}
          </p>
          
          <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
            This link will expire in 10 minutes. If you didn't request this, please ignore this email.
          </p>
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center;">
            <p style="color: #9ca3af; font-size: 12px; margin: 5px 0;">AK SecureTech Ltd - Installation and Services</p>
          </div>
        </div>
      </div>
    `;

    try {
      await sendEmail(user.email, subject, html);
      return res.json({
        message: "If that email exists in our system, a password reset link has been sent."
      });
    } catch (error) {
      console.error("Email send error:", error);
      // Clear the reset token if email fails
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;
      await user.save({ validateBeforeSave: false });

      return res.status(500).json({
        message: "Error sending email. Please try again later."
      });
    }

  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// ---------------- VERIFY RESET TOKEN ----------------
export const verifyResetToken = async (req, res) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({ message: "Reset token is required" });
    }

    // Hash the token to compare with stored hash
    const resetPasswordToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      resetPasswordToken,
      resetPasswordExpire: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired reset token" });
    }

    return res.json({ message: "Valid reset token" });

  } catch (err) {
    console.error("Verify reset token error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// ---------------- RESET PASSWORD ----------------
export const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!token) {
      return res.status(400).json({ message: "Reset token is required" });
    }

    if (!password || password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters long" });
    }

    // Hash the token to compare with stored hash
    const resetPasswordToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      resetPasswordToken,
      resetPasswordExpire: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired reset token" });
    }

    // Set new password (will be hashed by pre-save hook)
    user.passwordHash = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    return res.json({ message: "Password reset successfully" });

  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

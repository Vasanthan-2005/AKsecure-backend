import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export const protect = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({ message: 'Not authorized, no token' });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Handle transient admin sessions (not in DB)
      if (typeof decoded.id === 'string' && decoded.id.startsWith('admin-session-')) {
        const hexUsername = decoded.id.replace('admin-session-', '');
        const username = Buffer.from(hexUsername, 'hex').toString();
        
        req.user = {
          _id: decoded.id,
          name: `Admin ${username}`,
          email: `admin-${username}@system.local`,
          role: 'admin',
          companyName: 'System Admin'
        };
        return next();
      }

      req.user = await User.findById(decoded.id).select('-passwordHash');
      
      if (!req.user) {
        return res.status(401).json({ message: 'User not found' });
      }
      
      next();
    } catch (error) {
      return res.status(401).json({ message: 'Not authorized, token failed' });
    }
  } catch (error) {
    return res.status(500).json({ message: 'Server error' });
  }
};

export const adminOnly = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ message: 'Admin access required' });
  }
};




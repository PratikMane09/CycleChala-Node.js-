// src/middleware/roleCheck.js
export const checkRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        message: "User not authenticated",
        debug: { userPresent: false },
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        message: "Insufficient permissions",
        debug: {
          userRole: req.user.role,
          requiredRoles: roles,
        },
      });
    }

    next();
  };
};

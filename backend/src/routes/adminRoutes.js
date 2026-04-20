const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const { verifyToken, isAdmin } = require("../middlewares/authMiddleware");

router.use(verifyToken);
router.use(isAdmin);

router.get("/analytics", adminController.getAnalytics);
router.get("/users", adminController.getAllUsers);
router.get("/events", adminController.manageEvents);

module.exports = router;

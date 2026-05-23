/**
 * Global error handling middleware.
 * Catches anything that slips past route-level try/catch.
 */
function errorHandler(err, req, res, next) {
  console.error(`[ERROR] ${req.method} ${req.path} →`, err.message);

  // Prisma known errors
  if (err.code === "P2002") {
    return res.status(409).json({ error: "A record with this value already exists." });
  }
  if (err.code === "P2025") {
    return res.status(404).json({ error: "Record not found." });
  }

  // Default 500
  res.status(err.status || 500).json({
    error: err.message || "Internal server error.",
  });
}

module.exports = errorHandler;

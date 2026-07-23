const jwt = require('jsonwebtoken');

/** Verifies a partner (restaurant/rider) dashboard token issued by POST /api/partners/login */
function requirePartner(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing authentication token.' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.scope !== 'partner') return res.status(401).json({ error: 'Invalid token.' });
    req.partner = payload; // { sub, type, restaurantId, scope }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired session. Please log in again.' });
  }
}

/** Restricts to restaurant-type partner tokens only */
function requireRestaurant(req, res, next) {
  requirePartner(req, res, () => {
    if (req.partner.type !== 'restaurant') return res.status(403).json({ error: 'Restaurant account required.' });
    next();
  });
}

/** Restricts to rider-type partner tokens only */
function requireRider(req, res, next) {
  requirePartner(req, res, () => {
    if (req.partner.type !== 'rider') return res.status(403).json({ error: 'Rider account required.' });
    next();
  });
}

module.exports = { requirePartner, requireRestaurant, requireRider };

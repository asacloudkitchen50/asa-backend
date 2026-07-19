const db = require('../db/database');

/**
 * Returns the start (previous/this Friday 00:00) and end (upcoming Friday 00:00) timestamps
 * for the current settlement week, in the given timezone offset (defaults to IST, UTC+5:30).
 */
function currentWeekWindow() {
  const now = new Date();
  const day = now.getDay(); // 0=Sun ... 5=Fri ... 6=Sat
  const diffToFriday = (day >= 5) ? day - 5 : day + 2; // days since last Friday
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - diffToFriday);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  return { weekStart: weekStart.getTime(), weekEnd: weekEnd.getTime() };
}

/**
 * Computes what's owed to each restaurant and each rider for the current settlement week,
 * based on delivered orders in that window.
 */
function computeWeeklySettlement() {
  const { weekStart, weekEnd } = currentWeekWindow();

  const orders = db.prepare(
    `SELECT * FROM orders WHERE status = 'delivered' AND delivered_at >= ? AND delivered_at < ?`
  ).all(weekStart, weekEnd);

  const byRestaurant = {};
  const byRider = {};

  for (const o of orders) {
    const value = o.order_value || 0;
    const commission = value * ((o.commission_rate || 12) / 100);
    const restaurantNet = value - commission;

    if (o.restaurant) {
      byRestaurant[o.restaurant] = byRestaurant[o.restaurant] || { orders: 0, orderValue: 0, commission: 0, net: 0 };
      byRestaurant[o.restaurant].orders += 1;
      byRestaurant[o.restaurant].orderValue += value;
      byRestaurant[o.restaurant].commission += commission;
      byRestaurant[o.restaurant].net += restaurantNet;
    }
    if (o.rider) {
      // Base pay ₹20/order + ₹3/km is not tracked per-order here (no distance field);
      // this gives a simple ₹20 base-pay-per-order estimate. Extend the orders table with
      // a distance_km column if you want the full base+distance formula per order.
      byRider[o.rider] = byRider[o.rider] || { orders: 0, basePay: 0 };
      byRider[o.rider].orders += 1;
      byRider[o.rider].basePay += 20;
    }
  }

  return { weekStart, weekEnd, byRestaurant, byRider, totalOrders: orders.length };
}

module.exports = { computeWeeklySettlement, currentWeekWindow };

const PDFDocument = require('pdfkit');

/**
 * Generate a rider appointment letter as a PDF Buffer.
 * @param {{name: string, riderId: string, city: string}} rider
 * @returns {Promise<Buffer>}
 */
function generateAppointmentLetter(rider) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 60 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const company = process.env.COMPANY_NAME || 'ASA Foods';
    const signatory = process.env.COMPANY_SIGNATORY || 'Mohammad Ashraf Khan';
    const signatoryTitle = process.env.COMPANY_SIGNATORY_TITLE || 'Founder & CEO, ASA Group of Companies';
    const address = process.env.COMPANY_ADDRESS || '170 Tilak Nagar, Kota - 324007, Rajasthan';
    const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });

    doc.fontSize(20).fillColor('#7A1330').text(company, { align: 'center' });
    doc.moveDown(0.2);
    doc.fontSize(10).fillColor('#6E5B54').text(address, { align: 'center' });
    doc.moveDown(1.2);
    doc.strokeColor('#B8860B').lineWidth(1.5).moveTo(60, doc.y).lineTo(535, doc.y).stroke();
    doc.moveDown(1);

    doc.fontSize(11).fillColor('#241014');
    doc.text(`Date: ${today}`);
    doc.moveDown(0.5);
    doc.text(`To: ${rider.name}`);
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').text('Subject: Appointment Letter — Delivery Partner');
    doc.font('Helvetica');
    doc.moveDown(1);

    doc.text(`Dear ${rider.name},`);
    doc.moveDown(0.8);
    doc.text(
      `Congratulations! We are pleased to confirm your appointment as a Delivery Partner with ${company}. ` +
      `Your Rider ID is ${rider.riderId}, effective from the date of this letter, for the ${rider.city || 'assigned'} zone.`,
      { align: 'justify' }
    );
    doc.moveDown(0.8);
    doc.text(
      'Your registration fee is Rs. 1,500 — Rs. 500 covers your delivery bag and T-shirt kit (payable now), ' +
      'and the remaining Rs. 1,000 will be adjusted from your future earnings.',
      { align: 'justify' }
    );
    doc.moveDown(0.8);
    doc.text(
      'You will be paid weekly, Friday to Friday, with performance bonuses as you cross order milestones. ' +
      'Please review the cash deposit and reporting policy (6:00 PM deposit, 9:00 PM WhatsApp report) shared ' +
      'on our website before your first shift.',
      { align: 'justify' }
    );
    doc.moveDown(0.8);
    doc.text('We look forward to having you on the ASA Foods delivery team.', { align: 'justify' });
    doc.moveDown(2);
    doc.text(`For ${company}`);
    doc.text(signatory);
    doc.fontSize(9).fillColor('#6E5B54').text(signatoryTitle);

    doc.end();
  });
}

module.exports = { generateAppointmentLetter };

import jsPDF from 'jspdf';
import type { PayslipLine } from './payslip-lines';

/**
 * A lönebesked laid out the way a Swedish employer prints one: header with
 * employment number and payroll period, an Art/Text/Antal/A-pris/Belopp table,
 * a message block, and the summary box with vacation balances, accumulated
 * amounts and the payout.
 *
 * The document is built by buildPayslipDocument() on the server — this module
 * only draws it.
 */
export interface PayslipDocumentData {
  payMonth: string;
  workMonth: string;
  periodStart: string;
  periodEnd: string;
  payDate: string;
  employer: { name: string; orgNumber: string; address: string; zipCity: string };
  employee: { name: string; number: string; address: string; zipCity: string };
  lines: PayslipLine[];
  message: string;
  bankAccount: string;
  vacation: {
    paid: number | null;
    saved: number | null;
    advance: number | null;
    unpaid: number | null;
    entitlement: number;
    compBalance: number | null;
  };
  period: { gross: number; benefit: number; tax: number; workHours: number };
  accumulated: { gross: number; benefit: number; tax: number; workHours: number };
  employerFee: number;
  netPay: number;
  payout: number;
}

const PAGE_WIDTH = 210;
const MARGIN = 15;
const RIGHT = PAGE_WIDTH - MARGIN;

// Column anchors for the line-item table. Antal is right-aligned with its unit
// printed just after it, the way "120,73 Tim" reads on the employer's slip.
const COL_ART = MARGIN + 7;
const COL_TEXT = MARGIN + 10;
const COL_QTY = MARGIN + 100;
const COL_UNIT = MARGIN + 102;
const COL_PRICE = MARGIN + 140;
const COL_AMOUNT = RIGHT;

/**
 * jsPDF's WinAnsi fonts have neither U+00A0 nor the U+2212 minus sign sv-SE
 * formats with, and render both as a box — so both are replaced with ASCII.
 */
function fmt(amount: number, decimals = 2): string {
  return new Intl.NumberFormat('sv-SE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
    .format(amount)
    .replace(/\u00a0/g, ' ')
    .replace(/\u2212/g, '-');
}

export function generatePayslipPDF(data: PayslipDocumentData): jsPDF {
  const doc = new jsPDF('p', 'mm', 'a4');

  // --- Header ------------------------------------------------------------
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(0, 87, 184);
  doc.text(data.employer.name || 'Lönebesked', MARGIN, 26);

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(15);
  doc.text('Lönebesked', 85, 25);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(90, 90, 90);
  doc.text('Anställningsnr', 143, 21);
  doc.text('Löneperiod', 143, 27);
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  doc.text(data.employee.number || '-', RIGHT, 21, { align: 'right' });
  doc.setFontSize(8);
  doc.text(`${data.periodStart} - ${data.periodEnd}`, RIGHT, 27, { align: 'right' });

  // --- Parties -----------------------------------------------------------
  doc.setFontSize(8);
  doc.text(data.employer.orgNumber || '', MARGIN, 44);

  const partyRows: [string, string][] = [
    [data.employer.name, data.employee.name],
    [data.employer.address, data.employee.address],
    [data.employer.zipCity, data.employee.zipCity],
  ];
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  let partyY = 52;
  for (const [left, right] of partyRows) {
    if (left) doc.text(left, MARGIN, partyY);
    if (right) doc.text(right, 110, partyY);
    partyY += 9;
    doc.setFontSize(10);
  }

  // --- Line items --------------------------------------------------------
  let y = 88;
  y = drawTableHeader(doc, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  for (const line of data.lines) {
    // Keep the summary box on the last page: break before the rows reach it.
    if (y > 195) {
      doc.addPage();
      y = drawTableHeader(doc, 25);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
    }
    doc.text(line.art, COL_ART, y, { align: 'right' });
    doc.text(line.text, COL_TEXT, y);
    if (line.quantity !== null) {
      doc.text(fmt(line.quantity), COL_QTY, y, { align: 'right' });
      if (line.unit) doc.text(line.unit, COL_UNIT, y);
    }
    if (line.unitPrice !== null) doc.text(fmt(line.unitPrice), COL_PRICE, y, { align: 'right' });
    doc.text(fmt(line.amount), COL_AMOUNT, y, { align: 'right' });
    y += 5.5;
  }

  // --- Message -----------------------------------------------------------
  if (data.message.trim()) {
    y += 6;
    doc.setFontSize(9);
    doc.text('Meddelande', COL_TEXT, y);
    y += 5;
    for (const paragraph of data.message.split('\n')) {
      for (const wrapped of doc.splitTextToSize(paragraph, RIGHT - COL_TEXT) as string[]) {
        if (y > 205) break;
        doc.text(wrapped, COL_TEXT, y);
        y += 4.5;
      }
    }
  }

  drawSummaryBox(doc, data);

  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(150, 150, 150);
  doc.text(
    'Detta lönebesked är en uppskattning baserad på registrerade arbetstider och inställda avtalsnivåer.',
    MARGIN,
    287,
  );
  doc.text(
    'Det ersätter inte ett officiellt lönebesked från arbetsgivaren. Genererat med Tidsrapport-appen.',
    MARGIN,
    290.5,
  );

  return doc;
}

function drawTableHeader(doc: jsPDF, y: number): number {
  doc.setFillColor(200, 200, 200);
  doc.rect(MARGIN, y - 4, RIGHT - MARGIN, 6, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.text('Art', COL_ART, y, { align: 'right' });
  doc.text('Text', COL_TEXT, y);
  doc.text('Antal', COL_QTY, y, { align: 'right' });
  doc.text('A-pris', COL_PRICE, y, { align: 'right' });
  doc.text('Belopp', COL_AMOUNT, y, { align: 'right' });
  return y + 8;
}

function drawSummaryBox(doc: jsPDF, data: PayslipDocumentData) {
  const top = 216;
  const bottom = 282;

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.4);
  doc.rect(MARGIN, top, RIGHT - MARGIN, bottom - top);
  doc.line(MARGIN, top + 16, RIGHT, top + 16);

  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);

  // Vacation-day balances. A column the app has no source for stays blank
  // instead of printing a zero that would read as a real balance.
  const balances: [string, number | null][] = [
    ['Betalda', data.vacation.paid],
    ['Sparade', data.vacation.saved],
    ['Förskott', data.vacation.advance],
    ['Obetalda', data.vacation.unpaid],
    ['Semrätt', data.vacation.entitlement],
    ['Kompsaldo', data.vacation.compBalance],
  ];
  const columnWidth = (RIGHT - MARGIN) / balances.length;
  balances.forEach(([label, value], index) => {
    const x = MARGIN + 4 + index * columnWidth;
    doc.text(label, x, top + 6);
    if (value !== null) doc.text(fmt(value), x, top + 11);
  });

  const labelX = MARGIN + 4;
  const valueX = 105;
  const accX = 145;
  const rightLabelX = 112;

  doc.text('Skattefri ersättning', labelX, top + 24);
  doc.text('Övriga avdrag', rightLabelX, top + 24);

  doc.text('Bankkontonummer', labelX, top + 31);
  if (data.bankAccount) doc.text(data.bankAccount, MARGIN + 45, top + 31);
  doc.text('Månadens sociala avgifter', rightLabelX, top + 31);
  doc.text(fmt(data.employerFee, 0), RIGHT, top + 31, { align: 'right' });

  const rows: [string, number, number, boolean][] = [
    ['Bruttolön (Period/ackumulerat)', data.period.gross, data.accumulated.gross, true],
    // Benefits are not tracked, so the row stays blank rather than printing a
    // 0,00 that would read as a figure the app actually knows.
    ['Förmån (Period/ackumulerat)', data.period.benefit, data.accumulated.benefit, false],
    ['Prel skatt (Period/ackumulerat)', -data.period.tax, -data.accumulated.tax, true],
    ['Arbetad tid (Period/år)', data.period.workHours, data.accumulated.workHours, true],
  ];
  let rowY = top + 42;
  for (const [label, periodValue, accValue, alwaysShow] of rows) {
    doc.text(label, labelX, rowY);
    if (alwaysShow || periodValue !== 0) doc.text(fmt(periodValue), valueX, rowY, { align: 'right' });
    if (alwaysShow || accValue !== 0) doc.text(fmt(accValue), accX, rowY, { align: 'right' });
    rowY += 6;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('Utbetalas', RIGHT, top + 42, { align: 'right' });
  doc.setFontSize(10);
  doc.text(data.payDate, RIGHT, top + 49, { align: 'right' });
  doc.setFontSize(17);
  doc.text(fmt(data.payout), RIGHT, top + 59, { align: 'right' });
}

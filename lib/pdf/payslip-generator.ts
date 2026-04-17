import jsPDF from 'jspdf';

interface PayslipData {
  month: string;
  employeeName: string;
  employerName: string;
  hourlyRate: number;
  totalHours: number;
  workHours: number;
  sickDays: number;
  basePay: number;
  totalOB: number;
  obBreakdown: { percent: number; hours: number; amount: number }[];
  overtidMertid: number;
  overtidEnkel: number;
  overtidKvalificerad: number;
  totalOvertimePay: number;
  sickPay: number;
  grossBeforeVacation: number;
  vacationPay: number;
  vacationPayRate: number;
  includeVacationInSalary?: boolean;
  vacationDaysPay?: number;
  vacationDaysCount?: number;
  grossPay: number;
  tax: number;
  taxRate: number;
  taxMode?: string;
  taxTable?: number | null;
  netPay: number;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}

export function generatePayslipPDF(data: PayslipData): jsPDF {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = 210;
  const margin = 20;
  const contentWidth = pageWidth - 2 * margin;
  let y = margin;

  // Header
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('Lönebesked', margin, y);
  y += 10;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Period: ${data.month}`, margin, y);
  y += 6;

  if (data.employerName) {
    doc.text(`Arbetsgivare: ${data.employerName}`, margin, y);
    y += 5;
  }
  if (data.employeeName) {
    doc.text(`Arbetstagare: ${data.employeeName}`, margin, y);
    y += 5;
  }
  y += 5;

  // Separator
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  // Table header
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setFillColor(240, 240, 240);
  doc.rect(margin, y - 4, contentWidth, 7, 'F');

  const cols = [margin, margin + 60, margin + 90, margin + 110, margin + 130, margin + 150];
  doc.text('Art / Text', cols[0], y);
  doc.text('Antal', cols[1], y);
  doc.text('Enhet', cols[2], y);
  doc.text('A-pris', cols[3], y);
  doc.text('Belopp', cols[4], y);
  y += 8;

  doc.setFont('helvetica', 'normal');

  function addRow(art: string, antal: string, enhet: string, apris: string, belopp: string) {
    doc.text(art, cols[0], y);
    doc.text(antal, cols[1], y);
    doc.text(enhet, cols[2], y);
    doc.text(apris, cols[3], y);
    doc.text(belopp, cols[4], y);
    y += 5.5;
  }

  // Base pay
  addRow(
    'Timlön',
    data.workHours.toFixed(2),
    'tim',
    formatCurrency(data.hourlyRate),
    formatCurrency(data.basePay)
  );

  // OB rows
  for (const ob of data.obBreakdown) {
    addRow(
      `OB-tillägg ${ob.percent}%`,
      ob.hours.toFixed(2),
      'tim',
      formatCurrency(data.hourlyRate * ob.percent / 100),
      formatCurrency(ob.amount)
    );
  }

  // Overtime rows
  if (data.overtidMertid > 0) {
    addRow('Mertid (+35%)', '', '', '', formatCurrency(data.overtidMertid));
  }
  if (data.overtidEnkel > 0) {
    addRow('Enkel övertid (+35%)', '', '', '', formatCurrency(data.overtidEnkel));
  }
  if (data.overtidKvalificerad > 0) {
    addRow('Kval. övertid (+70%)', '', '', '', formatCurrency(data.overtidKvalificerad));
  }

  // Sick pay
  if (data.sickPay > 0) {
    addRow('Sjuklön (80%)', String(data.sickDays), 'dagar', '', formatCurrency(data.sickPay));
  }

  // Vacation day pay (semesterlön från föregående års pot)
  if (data.vacationDaysPay && data.vacationDaysPay > 0 && data.vacationDaysCount) {
    const dailyRate = data.vacationDaysPay / data.vacationDaysCount;
    addRow(
      `Semesterlön`,
      String(data.vacationDaysCount),
      'dagar',
      formatCurrency(dailyRate),
      formatCurrency(data.vacationDaysPay)
    );
  }

  // Vacation pay (12% semesterersättning)
  if (data.vacationPay > 0) {
    const vacLabel = data.includeVacationInSalary
      ? `Semesterersättning (${data.vacationPayRate}%, inkl. i lön)`
      : `Semesterersättning (${data.vacationPayRate}%, till semesterpott)`;
    addRow(vacLabel, '', '', '', formatCurrency(data.vacationPay));
  }

  y += 3;
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  // Summary box
  doc.setFillColor(245, 250, 255);
  doc.rect(margin, y - 4, contentWidth, 40, 'F');
  doc.setDrawColor(59, 130, 246);
  doc.rect(margin, y - 4, contentWidth, 40);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Sammanfattning', margin + 4, y);
  y += 7;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);

  const grossLabel = data.includeVacationInSalary ? 'Bruttolön (inkl. semesterersättning):' : 'Bruttolön:';
  doc.text(grossLabel, margin + 4, y);
  doc.text(formatCurrency(data.grossPay) + ' kr', margin + contentWidth - 4, y, { align: 'right' });
  y += 5;

  const taxLabel = data.taxMode === 'table' && data.taxTable
    ? `Skatt (tabell ${data.taxTable}):`
    : `Skatt (${data.taxRate}%):`;
  doc.text(taxLabel, margin + 4, y);
  doc.text('-' + formatCurrency(data.tax) + ' kr', margin + contentWidth - 4, y, { align: 'right' });
  y += 5;

  doc.text('Arbetade timmar:', margin + 4, y);
  doc.text(data.totalHours.toFixed(2) + ' tim', margin + contentWidth - 4, y, { align: 'right' });
  y += 7;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('Utbetalas:', margin + 4, y);
  doc.text(formatCurrency(data.netPay) + ' kr', margin + contentWidth - 4, y, { align: 'right' });

  // Footer disclaimer
  y = 270;
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(150, 150, 150);
  doc.text(
    'Detta lönebesked är en uppskattning baserad på registrerade arbetstider och inställda avtalsnivåer.',
    margin, y
  );
  doc.text(
    'Det ersätter inte ett officiellt lönebesked från arbetsgivaren. Genererat med Tidsrapport-appen.',
    margin, y + 3.5
  );

  return doc;
}

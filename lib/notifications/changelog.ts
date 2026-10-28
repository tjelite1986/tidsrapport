/**
 * What's new in the app, shown as "app_update" notices. Add an entry at the
 * top when a change is worth telling users about; every user whose account
 * existed on `date` gets it once, the next time their bell polls. `id` is the
 * dedup key — never change or reuse one. Text is Swedish, like the rest of the UI.
 */
export type AppUpdate = { id: string; date: string; title: string; body: string };

export const APP_UPDATES: AppUpdate[] = [
  {
    id: '2026-10-28-livelier-start-page',
    date: '2026-10-28',
    title: 'Ny startsida',
    body:
      'Startsidan visar nu överst vad du har tjänat ihop den här veckan och på hur många timmar, räknat brutto med OB. Nästa arbetspass har en egen ruta med nedräkning, och pågår ett pass ser du hur långt det har kommit. Ett nytt diagram visar timmarna för varje dag i månaden, med planerade pass i ljusare färg.',
  },
  {
    id: '2026-10-28-per-shift-rate',
    date: '2026-10-28',
    title: 'Egen timlön för ett pass',
    body:
      'Har ett pass en annan timlön än vanligt, till exempel ett vikariat, kan du nu skriva in den på passet under Tid, både när du lägger till och när du redigerar. Den timlönen gäller bara det passet: grundlön, OB, övertid och sjuklön räknas på den. Lämna fältet tomt så räknas passet som vanligt. Pass med egen timlön har en grön etikett med beloppet.',
  },
  {
    id: '2026-10-23-vacation-day-conflicts',
    date: '2026-10-23',
    title: 'Varning för pass på semesterdagar',
    body:
      'Ligger ett pass på en dag som också är semesterdag visas en varning överst under Tid, eftersom dagen annars räknas både som arbete och som semester. Tryck på datumet för att öppna passet. Den automatiska schemasynken lägger inte längre in pass på dina semesterdagar.',
  },
  {
    id: '2026-10-23-vacation-pot-from-payslips',
    date: '2026-10-23',
    title: 'Semesterpotten följer lönebeskeden',
    body:
      'För månader där du har laddat upp ett lönebesked räknas semesterersättningen nu på lönebeskedets bruttolön, inte på appens egen beräkning. Under Lön står det vid varje månad om beloppet kommer från ett lönebesked eller är beräknat från dina pass.',
  },
  {
    id: '2026-10-23-vacation-pot-per-year',
    date: '2026-10-23',
    title: 'Semesterpotten per år',
    body:
      'Under Lön ser du nu hur mycket som finns kvar av varje års semesterersättning: det du tjänar in ett år betalas ut som semesterlön året efter. Bara pass som redan har varit räknas in. Semesterlön per dag ställs in per år på Semester-sidan.',
  },
  {
    id: '2026-10-23-end-time-follows',
    date: '2026-10-23',
    title: 'Sluttiden öppnas direkt',
    body:
      'När du väljer starttid och trycker OK öppnas sluttiden direkt, så du slipper trycka på den själv. Det gäller även raster och händelser i kalendern. Tryck Avbryt om du bara ville ändra starttiden.',
  },
  {
    id: '2026-10-23-new-look',
    date: '2026-10-23',
    title: 'Ny layout i mobilen',
    body:
      'Menyn ligger nu längst ner: Hem, Tid, Lön, Lönespecar och Mer. Startsidan visar ditt nästa pass, kalendern får plats på telefonen och passen visas som kort. Färgerna betyder samma sak överallt: blått är tid, grönt är pengar, turkos är semester och rött är avdrag.',
  },
  {
    id: '2026-10-23-notices',
    date: '2026-10-23',
    title: 'Nytt: notiser',
    body:
      'Klockan i menyn visar ändringar i ditt schema när automatisk synk är på: nya pass, ändrade tider och borttagna pass — även om chefen ändrar ett pass som redan har synkats. "Visa tider" öppnar kalendern på rätt dag.\nHär kommer också nyheter i appen att dyka upp.',
  },
  {
    id: '2026-10-22-schedule-sync',
    date: '2026-10-22',
    title: 'Nytt: synka schemat från en kalenderlänk',
    body:
      'Under Tid → Importera schema → Kalenderlänk kan du klistra in din schemalänk från ipool och välja "Synka automatiskt". Passen läggs in var 30:e minut med rast och avdelning, och dagar med två pass blir två tider.',
  },
];

import Link from 'next/link';

const sections = [
  { id: 'kom-igang',         label: 'Kom igång' },
  { id: 'tidsregistrering',  label: 'Tidsregistrering' },
  { id: 'raster',            label: 'Raster' },
  { id: 'avdelningsloggning',label: 'Avdelningsloggning' },
  { id: 'schema-import',     label: 'Importera schema (AI)' },
  { id: 'timer',             label: 'Timer' },
  { id: 'lon',               label: 'Lön' },
  { id: 'installningar',     label: 'Inställningar' },
  { id: 'veckoschema',       label: 'Veckoschema' },
  { id: 'semesterersattning',label: 'Semesterersättning' },
  { id: 'rapporter',         label: 'Rapporter' },
  { id: 'statistik',         label: 'Statistik' },
  { id: 'pwa',               label: 'Installera som app' },
];

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="bg-white rounded-lg shadow p-6 mb-6 scroll-mt-20">
      <h2 className="text-xl font-bold text-gray-800 mb-4 pb-2 border-b border-gray-100">{title}</h2>
      <div className="text-sm text-gray-700 space-y-3 leading-relaxed">{children}</div>
    </section>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-blue-50 border-l-4 border-blue-400 px-4 py-2 rounded-r text-blue-800 text-sm">
      {children}
    </div>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-green-50 border-l-4 border-green-400 px-4 py-2 rounded-r text-green-800 text-sm">
      {children}
    </div>
  );
}

function Warn({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-red-50 border-l-4 border-red-400 px-4 py-2 rounded-r text-red-800 text-sm">
      {children}
    </div>
  );
}

function Dl({ items }: { items: { term: string; desc: string }[] }) {
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
      {items.map(({ term, desc }) => (
        <>
          <dt key={term + '-dt'} className="font-semibold text-gray-800 whitespace-nowrap">{term}</dt>
          <dd key={term + '-dd'} className="text-gray-600">{desc}</dd>
        </>
      ))}
    </dl>
  );
}

export default function HjalpPage() {
  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Hjälp & guide</h1>
      <p className="text-gray-500 text-sm mb-6">En genomgång av alla funktioner i Tidsrapport.</p>

      {/* Innehållsförteckning */}
      <div className="bg-white rounded-lg shadow p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Innehåll</h2>
        <ol className="grid grid-cols-1 sm:grid-cols-2 gap-1">
          {sections.map((s, i) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="flex items-center gap-2 text-sm text-blue-700 hover:underline py-0.5"
              >
                <span className="text-gray-400 text-xs w-4 text-right">{i + 1}.</span>
                {s.label}
              </a>
            </li>
          ))}
        </ol>
      </div>

      {/* 1. Kom igång */}
      <Section id="kom-igang" title="1. Kom igång">
        <p>
          Tidsrapport är ett verktyg för att registrera arbetstider och räkna ut lön enligt
          Handels kollektivavtal. Grundflödet är enkelt:
        </p>
        <ol className="list-decimal list-inside space-y-1 pl-2">
          <li>Ställ in dina uppgifter under <Link href="/installningar" className="text-blue-600 hover:underline">Inställningar</Link> (lönetyp, arbetsplats, skatt m.m.)</li>
          <li>Registrera dina arbetstider under <Link href="/tid" className="text-blue-600 hover:underline">Tidsregistrering</Link> dagligen eller i efterhand.</li>
          <li>Se din beräknade lön under <Link href="/lon" className="text-blue-600 hover:underline">Lön</Link> — uppdateras automatiskt.</li>
        </ol>
        <Note>
          Första gången: gå till Inställningar och välj rätt lönetyp, arbetsplatstyp och skatteuppgifter innan du börjar registrera tid.
        </Note>
      </Section>

      {/* 2. Tidsregistrering */}
      <Section id="tidsregistrering" title="2. Tidsregistrering">
        <p>
          Under <Link href="/tid" className="text-blue-600 hover:underline">Tidsregistrering</Link> registrerar du
          arbetade pass. Fyll i datum, start- och sluttid, rast och välj projekt.
        </p>

        <h3 className="font-semibold text-gray-800 mt-4 mb-1">Rapporttyp</h3>
        <Dl items={[
          { term: 'Arbete', desc: 'Normalt arbetad tid. Grundlön, OB och övertid beräknas.' },
          { term: 'Sjuk',   desc: 'Sjukfrånvaro. Karensdag ger 0 kr, dag 2+ ger 80% av timlönen.' },
        ]} />

        <h3 className="font-semibold text-gray-800 mt-4 mb-1">Övertidstyp</h3>
        <Dl items={[
          { term: 'Ingen',         desc: 'Vanlig arbetstid utan övertidstillägg.' },
          { term: 'Mertid',        desc: '+35% på timlönen för timmar utöver schemalagd tid (upp till heltid).' },
          { term: 'Enkel övertid', desc: '+35% på timlönen. Gäller för de första övertidstimmarna.' },
          { term: 'Kval. övertid', desc: '+70% på timlönen. Gäller när enkel övertid är förbrukad.' },
        ]} />

        <h3 className="font-semibold text-gray-800 mt-4 mb-1">Kalendervy</h3>
        <p>
          Växla mellan vecko- och månadsvy med knapparna ovanför kalendern. I månadsvy syns
          start–sluttid, timmar och bruttolön per dag direkt i kalendercellerna. Klicka på ett pass
          för att se detaljer, redigera eller radera det.
        </p>

        <h3 className="font-semibold text-gray-800 mt-4 mb-1">Radera ett pass</h3>
        <p>
          Klicka på ett pass i kalendern för att öppna detaljvyn. Längst ner finns en röd
          <strong> Radera</strong>-knapp. En bekräftelsefråga visas innan passet tas bort permanent.
        </p>

        <Tip>
          Har du ett veckoschema inställt fylls start- och sluttid i automatiskt när du väljer ett datum.
          Du kan alltid ändra värdena manuellt efteråt.
        </Tip>
      </Section>

      {/* 3. Raster */}
      <Section id="raster" title="3. Raster">
        <p>
          Du kan ange rast på två sätt — automatiskt eller manuellt med exakta tider.
          Systemet stöder <strong>flera rastperioder</strong> per pass.
        </p>

        <h3 className="font-semibold text-gray-800 mt-4 mb-1">Auto-läge</h3>
        <p>
          När "Auto" är aktiverat beräknas en rastperiod automatiskt baserat på passets längd.
          Rasten placeras mitt i passet. Standardgränserna är:
        </p>
        <Dl items={[
          { term: '≥ 4 timmar', desc: '15 minuters rast' },
          { term: '≥ 6 timmar', desc: '30 minuters rast' },
          { term: '≥ 8 timmar', desc: '60 minuters rast' },
        ]} />
        <p>
          Dessa gränser kan du anpassa under <Link href="/installningar" className="text-blue-600 hover:underline">Inställningar</Link> → Rastgränser.
        </p>

        <h3 className="font-semibold text-gray-800 mt-4 mb-1">Manuellt läge</h3>
        <p>
          Klicka på "Manuell" för att ange exakt när rasten börjar och slutar (HH:MM-format).
          Vill du ha <strong>flera raster</strong> (t.ex. lunch och kaffepaus) klickar du på
          "+ Lägg till rast" för att lägga till ytterligare rader. Varje rad har en
          start- och sluttid. Minuter räknas ihop automatiskt.
        </p>
        <Tip>
          Klicka direkt i ett tidsfält i auto-läge för att byta till manuellt — auto-rasten
          omvandlas till en redigerbar rad.
        </Tip>

        <h3 className="font-semibold text-gray-800 mt-4 mb-1">Anpassade rastgränser</h3>
        <p>
          Under Inställningar → Löne- och OB-inställningar → Rastgränser kan du lägga till egna
          regler, t.ex. "pass ≥ 5h → 20 min rast". Den längsta matchande regeln gäller.
          Lämnas listan tom används standardvärdena ovan.
        </p>
      </Section>

      {/* 4. Avdelningsloggning */}
      <Section id="avdelningsloggning" title="4. Avdelningsloggning">
        <p>
          Om du arbetar på flera avdelningar under ett pass kan du logga hur lång tid du spenderade
          på respektive avdelning. Det påverkar <strong>inte</strong> löneberäkningen — det är
          enbart en anteckning för din egen uppföljning.
        </p>

        <h3 className="font-semibold text-gray-800 mt-4 mb-1">Aktivera avdelningar</h3>
        <ol className="list-decimal list-inside pl-2 space-y-1">
          <li>Gå till <Link href="/installningar" className="text-blue-600 hover:underline">Inställningar</Link> → Avdelningar.</li>
          <li>Skriv in avdelningsnamn (t.ex. "Kassa", "Varuplock", "Lager") och klicka Lägg till.</li>
          <li>Spara inställningarna.</li>
        </ol>
        <p>
          Avdelningseditorn visas nu i tidsregistreringsformuläret. Ange start- och sluttid för
          varje avdelning. Systemet varnar om perioderna överlappar eller hamnar utanför passets tider.
        </p>

        <h3 className="font-semibold text-gray-800 mt-4 mb-1">Detaljvyn</h3>
        <p>
          Klickar du på ett pass med avdelningsloggning visas en <strong>tidslinje</strong> med
          färgkodade block per avdelning, plus en lista med tider.
        </p>

        <h3 className="font-semibold text-gray-800 mt-4 mb-1">Avdelningsstatistik</h3>
        <p>
          På <Link href="/statistik" className="text-blue-600 hover:underline">Statistik</Link>-sidan
          visas ett eget avsnitt med timmar per avdelning (stapel- och cirkeldiagram samt månadsfördelning),
          förutsatt att du har loggat avdelningar.
        </p>
      </Section>

      {/* 5. Schema-import (AI) */}
      <Section id="schema-import" title="5. Importera schema (AI)">
        <p>
          Funktionen låter dig ladda upp en skärmdump av ditt arbetsschema — AI:n (Claude Haiku)
          läser av datum och tider automatiskt och skapar förslag på tidsregistreringar.
        </p>

        <h3 className="font-semibold text-gray-800 mt-4 mb-1">Så här gör du</h3>
        <ol className="list-decimal list-inside pl-2 space-y-1">
          <li>Klicka på <strong>Importera schema</strong> i Tidsregistrering (knappen ovanför formuläret).</li>
          <li>Välj månad och år som schemat gäller för.</li>
          <li>Ladda upp en skärmdump (PNG, JPG eller WEBP) av schemat — dra och släpp eller klicka.</li>
          <li>Klicka på <strong>Analysera schema</strong> och vänta några sekunder.</li>
          <li>Granska listan med hittade pass. Du kan:
            <ul className="list-disc list-inside pl-4 mt-1 space-y-0.5">
              <li>Kryssa för/av vilka pass som ska importeras.</li>
              <li>Redigera start- och sluttid direkt i listan.</li>
              <li>Ange rast i minuter per pass.</li>
            </ul>
          </li>
          <li>Välj projekt och klicka <strong>Importera</strong>.</li>
        </ol>

        <Note>
          AI-tolkning kan ibland bli fel, särskilt vid dålig bildkvalitet eller ovanliga schemaformat.
          Granska alltid listan innan du importerar och justera vid behov.
        </Note>
        <Tip>
          Tar du en skärmdump direkt från appen/systemet där schemat visas får du bäst resultat.
          Se till att dagsiffrorna syns tydligt i bilden.
        </Tip>
      </Section>

      {/* 6. Timer */}
      <Section id="timer" title="6. Timer">
        <p>
          Under <Link href="/timer" className="text-blue-600 hover:underline">Timer</Link> kan du
          mäta arbetstiden i realtid. Starta timern när du börjar jobba och stoppa den när du är klar.
        </p>
        <ul className="list-disc list-inside pl-2 space-y-1">
          <li>Timern fortsätter köra även om du stänger fliken eller byter sida — tillståndet sparas lokalt i webbläsaren.</li>
          <li>När du stoppar timern fylls datum, start- och sluttid i automatiskt i registreringsformuläret.</li>
          <li>Du kan ange rast och projekt innan du sparar.</li>
        </ul>
      </Section>

      {/* 7. Lön */}
      <Section id="lon" title="7. Lön">
        <p>
          Lönesidan visar din beräknade lön för en vald <strong>utbetalningsmånad</strong>.
          Väljer du exempelvis december visas lön för arbete utfört i november
          (Handels utbetalningsmodell: lön för föregående månad).
        </p>

        <h3 className="font-semibold text-gray-800 mt-4 mb-1">Lönekomponenter</h3>
        <Dl items={[
          { term: 'Grundlön',           desc: 'Timlön × arbetade timmar (eller fast månadslön vid "Fast lön + tillägg").' },
          { term: 'OB-tillägg',         desc: 'Ersättning för obekväm arbetstid (kvällar, nätter, helger) enligt kollektivavtal.' },
          { term: 'Övertid',            desc: 'Mertid (+35%), enkel övertid (+35%) eller kval. övertid (+70%).' },
          { term: 'Sjuklön',            desc: '80% av timlönen för sjukdag 2 och framåt. Karensdag = 0 kr.' },
          { term: 'Semesterersättning', desc: 'Beräknas som en procentsats (vanligen 12%) på bruttolönen.' },
          { term: 'Skatt',              desc: 'Dras från bruttolönen. Beräknas antingen som procentsats eller via Skatteverkets tabeller.' },
        ]} />

        <h3 className="font-semibold text-gray-800 mt-4 mb-1">OB-tillägg — butik vs lager</h3>
        <ul className="list-disc list-inside pl-2 space-y-1">
          <li><strong>Butik:</strong> OB och övertid staplas inte — det högre tillägget gäller för dagen.</li>
          <li><strong>Lager:</strong> Både OB och övertid adderas.</li>
        </ul>

        <h3 className="font-semibold text-gray-800 mt-4 mb-1">Skattetabell</h3>
        <p>
          Under Inställningar kan du välja "Skattetabell" och söka upp din kommun — tabellnummer
          och skattesats (Skatteverkets officiella tabeller 2026) sätts automatiskt.
          Du kan också ange tabellnummer (29–42) direkt.
        </p>

        <h3 className="font-semibold text-gray-800 mt-4 mb-1">Daglig uppdelning</h3>
        <p>
          Längst ner på lönesidan finns en tabell med uppdelning per dag — grundlön, OB och övertid
          visas separat för varje post. Klicka på ett pass i Tidsregistrering för att se en
          detaljerad lönespecifikation direkt i detaljvyn.
        </p>
      </Section>

      {/* 8. Inställningar */}
      <Section id="installningar" title="8. Inställningar">
        <h3 className="font-semibold text-gray-800 mb-1">Lönetyp</h3>
        <Dl items={[
          { term: 'Avtalsenlig timlön', desc: 'Timlönen hämtas automatiskt från vald avtalsnivå (Handels 2025).' },
          { term: 'Individuell timlön', desc: 'Ange din exakta timlön i kr/h. OB och övertid beräknas ovanpå.' },
          { term: 'Fast lön + tillägg', desc: 'Ange en fast månadslön. OB och övertid beräknas med timlönen = månlön ÷ timmar/månad.' },
        ]} />

        <h3 className="font-semibold text-gray-800 mt-4 mb-1">Arbetsplatstyp</h3>
        <p>Styr vilka OB-regler som gäller: Butik, Lager eller Ingen OB.</p>

        <h3 className="font-semibold text-gray-800 mt-4 mb-1">Skatteuppgifter</h3>
        <ul className="list-disc list-inside pl-2 space-y-1">
          <li><strong>Procentsats:</strong> Ange din skattesats i procent manuellt.</li>
          <li><strong>Skattetabell:</strong> Sök upp din kommun — tabellnummer sätts automatiskt. Du kan också ange tabellnummer (29–42) direkt.</li>
        </ul>

        <h3 className="font-semibold text-gray-800 mt-4 mb-1">Automatisk rastberäkning & rastgränser</h3>
        <p>
          Aktivera "Automatisk rastberäkning" för att låta systemet föreslå rast baserat på
          passets längd. Under <strong>Rastgränser</strong> lägger du till egna regler:
        </p>
        <ul className="list-disc list-inside pl-2 space-y-0.5">
          <li>Klicka "+ Lägg till regel" och ange minsta antal timmar och rastlängd i minuter.</li>
          <li>Lägg till flera regler — den längsta matchande gäller.</li>
          <li>Tomma regellistan → standardvärdena (4h→15min, 6h→30min, 8h→60min) används.</li>
        </ul>

        <h3 className="font-semibold text-gray-800 mt-4 mb-1">Semesterersättning</h3>
        <Dl items={[
          { term: 'Inkluderad i timlön',  desc: 'Semesterersättningen ingår redan i timlönen (vanlig för timavlönade inom Handels).' },
          { term: 'Separat ackumulering', desc: 'Semesterersättningen samlas i en pott och kan tas ut manuellt via Lön-sidan.' },
        ]} />

        <h3 className="font-semibold text-gray-800 mt-4 mb-1">Avdelningar</h3>
        <p>
          Lägg till avdelningsnamn (t.ex. "Kassa", "Varuplock") för att aktivera avdelningsloggning
          per pass. Se avsnitt 4 för mer info.
        </p>

        <h3 className="font-semibold text-gray-800 mt-4 mb-1">Arbetsmallar</h3>
        <p>
          Spara vanliga pass (t.ex. "Morgonpass 07–16, 30 min rast") och välj dem snabbt vid registrering
          via mallväljaren i formuläret.
        </p>

        <h3 className="font-semibold text-gray-800 mt-4 mb-1">Övriga inställningar</h3>
        <Dl items={[
          { term: 'Arbetstimmar/månad',    desc: 'Används för att räkna ut timlön vid fast lön (standard 160 h).' },
          { term: 'Standard starttid/sluttid', desc: 'Förifylls i tidsregistreringsformuläret vid nya poster.' },
          { term: 'Standardvy (kalender)', desc: 'Välj om Tidsregistrering öppnas i vecko- eller månadsvy.' },
        ]} />

        <h3 className="font-semibold text-gray-800 mt-4 mb-1">Farlig zon</h3>
        <Warn>
          Längst ner i Inställningar finns en <strong>Farlig zon</strong> med möjlighet att radera
          alla dina tidsregistreringar permanent. Åtgärden kräver ett extra bekräftelsesteg men
          kan inte ångras.
        </Warn>
      </Section>

      {/* 9. Veckoschema */}
      <Section id="veckoschema" title="9. Veckoschema">
        <p>
          Under Inställningar kan du ange ett veckoschema med tider per veckodag. Schemat
          används för att automatiskt fylla i start- och sluttid när du registrerar ett pass på
          ett visst datum.
        </p>

        <h3 className="font-semibold text-gray-800 mt-4 mb-1">Roterande A/B/C/D-schema</h3>
        <p>
          Arbetar du ett roterande schema ställer du in ett <strong>referensdatum</strong>
          (den måndag vecka A börjar) och väljer rotationslängd:
        </p>
        <ul className="list-disc list-inside pl-2 space-y-1">
          <li><strong>2 veckor (A/B):</strong> Vecka A och B växlar varannan vecka.</li>
          <li><strong>4 veckor (A/B/C/D):</strong> Fyra olika veckor i rotation.</li>
        </ul>
        <p>
          Varje vecka (A/B/C/D) har sin egna flik med separata tider per dag. I
          <strong> månadspreviewen</strong> längst ner ser du vilken vecka som gäller för varje dag
          under en valfri månad — färgkodad per vecka.
        </p>
        <Tip>
          Schemat visas som en streckad indikator i månads- och veckavyn i Tidsregistrering för
          dagar du inte har registrerat något pass. Klicka på en sådan dag för att snabbt
          förifyla formuläret med schemats tider.
        </Tip>
      </Section>

      {/* 10. Semesterersättning */}
      <Section id="semesterersattning" title="10. Semesterersättning">
        <p>
          Om du har valt "Separat ackumulering" samlas semesterersättningen (vanligen 12% av
          bruttolönen) i en pott per <strong>intjänandeår</strong>.
        </p>
        <Dl items={[
          { term: 'Intjänandeår',    desc: 'Semesterersättning intjänad under ett kalenderår (jan–dec) används för semester nästkommande år.' },
          { term: 'Uttag',           desc: 'Gör ett uttag via Lön-sidan. Skatt och nettoutbetalning visas i en förhandsgranskning.' },
          { term: 'Inkludera i lön', desc: 'Per-månads-knapp på Lön-sidan: semesterersättningen för den månaden läggs ihop med lönen och skattas direkt, istället för att läggas i potten.' },
        ]} />
      </Section>

      {/* 11. Rapporter */}
      <Section id="rapporter" title="11. Rapporter">
        <p>
          Under <Link href="/rapporter" className="text-blue-600 hover:underline">Rapporter</Link> kan
          du exportera dina tidsregistreringar som en CSV-fil. Välj tidsperiod och klicka
          på "Exportera CSV". Filen kan öppnas i Excel eller liknande program.
        </p>
        <p>
          Rapporten innehåller datum, start/slut, timmar, rast, projekt, typ (arbete/sjuk),
          övertidstyp och beräknad grundlön per dag.
        </p>
      </Section>

      {/* 12. Statistik */}
      <Section id="statistik" title="12. Statistik">
        <p>
          Statistiksidan visar diagram över dina arbetstider och löner för ett valfritt år:
        </p>
        <ul className="list-disc list-inside pl-2 space-y-1">
          <li>Timmar och bruttolön per månad (stapeldiagram)</li>
          <li>Fördelning av grundlön, OB och övertid (cirkeldiagram)</li>
          <li>Trender över tid (linjediagram)</li>
        </ul>

        <h3 className="font-semibold text-gray-800 mt-4 mb-1">Avdelningsstatistik</h3>
        <p>
          Om du har loggat avdelningar visas ett extra avsnitt med:
        </p>
        <ul className="list-disc list-inside pl-2 space-y-1">
          <li>Totalt antal timmar per avdelning (stapeldiagram)</li>
          <li>Procentandel av total arbetstid per avdelning (cirkeldiagram)</li>
          <li>Månadsvis fördelning per avdelning (staplat stapeldiagram)</li>
        </ul>
      </Section>

      {/* 13. PWA */}
      <Section id="pwa" title="13. Installera som app">
        <p>
          Tidsrapport är en Progressive Web App (PWA) och kan installeras på din enhet för
          att öppna direkt från hemskärmen — utan webbläsarens gränssnitt.
        </p>

        <h3 className="font-semibold text-gray-800 mt-4 mb-1">Android / Chrome</h3>
        <ol className="list-decimal list-inside pl-2 space-y-1">
          <li>Öppna sidan i Chrome.</li>
          <li>Tryck på menyn (tre punkter uppe till höger).</li>
          <li>Välj "Lägg till på startskärmen" eller "Installera app".</li>
        </ol>

        <h3 className="font-semibold text-gray-800 mt-4 mb-1">iPhone / Safari</h3>
        <ol className="list-decimal list-inside pl-2 space-y-1">
          <li>Öppna sidan i Safari.</li>
          <li>Tryck på dela-knappen (fyrkant med pil uppåt).</li>
          <li>Välj "Lägg till på hemskärmen".</li>
        </ol>

        <h3 className="font-semibold text-gray-800 mt-4 mb-1">Dator (Chrome / Edge)</h3>
        <ol className="list-decimal list-inside pl-2 space-y-1">
          <li>Titta efter en liten installations-ikon i adressfältet (hus med plus-tecken).</li>
          <li>Klicka på den och bekräfta installationen.</li>
        </ol>

        <Note>
          Appen kräver alltid internetanslutning för att logga in och hämta data — den fungerar
          inte offline. API-anrop går alltid direkt till servern.
        </Note>
      </Section>

      <div className="text-center text-xs text-gray-400 py-4">
        Tidsrapport &mdash; baserat på Handels kollektivavtal
      </div>
    </div>
  );
}

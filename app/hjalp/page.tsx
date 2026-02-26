import Link from 'next/link';

const sections = [
  { id: 'kom-igang',         label: 'Kom igång' },
  { id: 'tidsregistrering',  label: 'Tidsregistrering' },
  { id: 'timer',             label: 'Timer' },
  { id: 'lon',               label: 'Lön' },
  { id: 'installningar',     label: 'Inställningar' },
  { id: 'veckoschema',       label: 'Veckoschema' },
  { id: 'semesterersattning',label: 'Semesterersättning' },
  { id: 'rapporter',         label: 'Rapporter' },
  { id: 'statistik',         label: 'Statistik' },
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
          { term: 'Sjuk', desc: 'Sjukfrånvaro. Karensdag ger 0 kr, dag 2+ ger 80% av timlönen.' },
        ]} />

        <h3 className="font-semibold text-gray-800 mt-4 mb-1">Övertidstyp</h3>
        <Dl items={[
          { term: 'Ingen',         desc: 'Vanlig arbetstid utan övertidstillägg.' },
          { term: 'Mertid',        desc: '+35% på timlönen för timmar utöver schemalagd tid (upp till heltid).' },
          { term: 'Enkel övertid', desc: '+35% på timlönen. Gäller för de första övertidstimmarna.' },
          { term: 'Kval. övertid', desc: '+70% på timlönen. Gäller när enkel övertid är förbrukad.' },
        ]} />

        <h3 className="font-semibold text-gray-800 mt-4 mb-1">Rast</h3>
        <p>
          Du kan ange rast i minuter direkt, eller byta till tidläge (klicka på "Auto / min / tid")
          och ange exakt när rasten börjar och slutar — minuter räknas ut automatiskt.
        </p>
        <Tip>
          Har du ett veckoschema inställt fylls start- och sluttid i automatiskt när du väljer ett datum.
          Du kan alltid ändra värdena manuellt efteråt.
        </Tip>

        <h3 className="font-semibold text-gray-800 mt-4 mb-1">Kalendervy</h3>
        <p>
          Växla mellan vecko- och månadsvy med knapparna ovanför kalendern. I månadsvy syns
          start–sluttid, timmar och bruttolön per dag direkt i kalendercellerna. Klicka på en dag
          för att redigera eller lägga till ett pass.
        </p>
      </Section>

      {/* 3. Timer */}
      <Section id="timer" title="3. Timer">
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

      {/* 4. Lön */}
      <Section id="lon" title="4. Lön">
        <p>
          Lönesidan visar din beräknade lön för en vald <strong>utbetalningsmånad</strong>.
          Väljer du exempelvis december visas lön för arbete utfört i november
          (Handels utbetalningsmodell: lön för föregående månad).
        </p>

        <h3 className="font-semibold text-gray-800 mt-4 mb-1">Lönekomponenter</h3>
        <Dl items={[
          { term: 'Grundlön',            desc: 'Timlön × arbetade timmar (eller fast månadslön vid "Fast lön + tillägg").' },
          { term: 'OB-tillägg',          desc: 'Ersättning för obekväm arbetstid (kvällar, nätter, helger) enligt kollektivavtal.' },
          { term: 'Övertid',             desc: 'Mertid (+35%), enkel övertid (+35%) eller kval. övertid (+70%).' },
          { term: 'Sjuklön',             desc: '80% av timlönen för sjukdag 2 och framåt. Karensdag = 0 kr.' },
          { term: 'Semesterersättning',  desc: 'Beräknas som en procentsats (vanligen 12%) på bruttolönen.' },
          { term: 'Skatt',               desc: 'Dras från bruttolönen. Beräknas antingen som procentsats eller via Skatteverkets tabeller.' },
        ]} />

        <h3 className="font-semibold text-gray-800 mt-4 mb-1">OB-tillägg — butik vs lager</h3>
        <p>
          Reglerna för OB skiljer sig åt beroende på arbetsplatstyp:
        </p>
        <ul className="list-disc list-inside pl-2 space-y-1">
          <li><strong>Butik:</strong> OB och övertid staplas inte — det högre tillägget gäller för dagen.</li>
          <li><strong>Lager:</strong> Både OB och övertid adderas.</li>
        </ul>

        <h3 className="font-semibold text-gray-800 mt-4 mb-1">Skattetabell</h3>
        <p>
          Under Inställningar kan du välja skattemetod. Med "Skattetabell" väljer du din
          kommun så slås rätt tabell (29–42) upp automatiskt ur Skatteverkets officiella tabeller
          för 2025 och 2026.
        </p>

        <h3 className="font-semibold text-gray-800 mt-4 mb-1">Daglig uppdelning</h3>
        <p>
          Längst ner på lönesidan finns en tabell med uppdelning per dag — grundlön, OB och övertid
          visas separat för varje post.
        </p>
      </Section>

      {/* 5. Inställningar */}
      <Section id="installningar" title="5. Inställningar">
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
          <li><strong>Skattetabell:</strong> Sök upp din kommun — tabellnummer och skattesats sätts automatiskt. Du kan också ange tabellnummer (29–42) direkt.</li>
        </ul>

        <h3 className="font-semibold text-gray-800 mt-4 mb-1">Semesterersättning</h3>
        <Dl items={[
          { term: 'Inkluderad i timlön', desc: 'Semesterersättningen ingår redan i timlönen (vanlig för timavlönade inom Handels).' },
          { term: 'Separat ackumulering', desc: 'Semesterersättningen samlas i en pott och kan tas ut manuellt via Lön-sidan.' },
        ]} />

        <h3 className="font-semibold text-gray-800 mt-4 mb-1">Övriga inställningar</h3>
        <Dl items={[
          { term: 'Arbetstimmar/månad', desc: 'Används för att räkna ut timlön vid fast lön (standard 160 h).' },
          { term: 'Automatisk rastberäkning', desc: 'Räknar ut rast automatiskt baserat på passets längd.' },
          { term: 'Standard starttid/sluttid', desc: 'Förifylls i tidsregistreringsformuläret vid nya poster.' },
          { term: 'Arbetsmallar', desc: 'Spara vanliga pass (t.ex. "Morgonpass 07–16") och välj dem snabbt vid registrering.' },
        ]} />
      </Section>

      {/* 6. Veckoschema */}
      <Section id="veckoschema" title="6. Veckoschema">
        <p>
          Under Inställningar kan du ange ett veckoschema med tider per veckodag. Schemat
          används för att automatiskt fylla i start- och sluttid när du registrerar ett pass på
          ett visst datum.
        </p>

        <h3 className="font-semibold text-gray-800 mt-4 mb-1">Roterande A/B-schema</h3>
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

      {/* 7. Semesterersättning */}
      <Section id="semesterersattning" title="7. Semesterersättning">
        <p>
          Om du har valt "Separat ackumulering" samlas semesterersättningen (vanligen 12% av
          bruttolönen) i en pott per <strong>intjänandeår</strong>.
        </p>
        <Dl items={[
          { term: 'Intjänandeår',  desc: 'Semesterersättning intjänad under ett kalenderår (jan–dec) används för semester nästkommande år.' },
          { term: 'Uttag',         desc: 'Gör ett uttag via Lön-sidan. Skatt och nettoutbetalning visas i en förhandsgranskning.' },
          { term: 'Inkludera i lön', desc: 'Per-månads-knapp på Lön-sidan: semesterersättningen för den månaden läggs ihop med lönen och skattas direkt, istället för att läggas i potten.' },
        ]} />
      </Section>

      {/* 8. Rapporter */}
      <Section id="rapporter" title="8. Rapporter">
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

      {/* 9. Statistik */}
      <Section id="statistik" title="9. Statistik">
        <p>
          Statistiksidan visar diagram över dina arbetstider och löner:
        </p>
        <ul className="list-disc list-inside pl-2 space-y-1">
          <li>Timmar och bruttolön per månad (stapeldiagram)</li>
          <li>Fördelning av grundlön, OB och övertid (cirkeldiagram)</li>
          <li>Trender över tid (linjediagram)</li>
        </ul>
        <p>Välj ett anpassat datumintervall för att filtrera statistiken.</p>
      </Section>

      <div className="text-center text-xs text-gray-400 py-4">
        Tidsrapport &mdash; baserat på Handels kollektivavtal
      </div>
    </div>
  );
}

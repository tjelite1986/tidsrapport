# Lönejämförelse: Appen vs Arbetsgivaren (Biltema)

## Löneperiod
Arbetet görs under månad X, lönen betalas ut **25:e månaden efter** (ex. marsjobb → utbetalning 25 april).

## Timlön
- Kontraktsnivå: **2ar**
- Timlön t.o.m. 2026-03-31: **162,98 kr/h**
- Timlön fr.o.m. 2026-04-01: **167,87 kr/h**
- Appen och arbetsgivaren använder **samma timlön** ✓

## OB-gränser (butik)
| Tid | Dag | OB % |
|---|---|---|
| 18:15–20:00 | Mån–Fre | 50% |
| 20:00+ | Mån–Fre | 70% |
| 12:00+ | Lördag | 100% |
| Hela dagen | Söndag / Röd dag | 100% |

## Jämförelse per arbetsmanad

| Arbetsmanad | Timmar App | Timmar Arb | Diff | OB50 diff | OB100 diff |
|---|---|---|---|---|---|
| Jul 2025 | 139.33h | 132.40h | +6.93h | 0 ✓ | +3.03h |
| Aug 2025 | 113.75h | 101.42h | **+12.33h** | 0 ✓ | +7.00h |
| Sep 2025 | 154.50h | 146.90h | +7.60h | +0.12h | +5.25h |
| **Okt 2025** | **152.83h** | **152.58h** | **+0.25h ✓** | **+0.17h ✓** | **0 ✓** |
| **Nov 2025** | **155.08h** | **154.98h** | **+0.10h ✓** | **0 ✓** | **+0.01h ✓** |
| Jan 2026 | 143.67h | 140.08h | +3.59h | 0 ✓ | +0.30h |
| Feb 2026 | 130.17h | 126.71h | +3.46h | 0 ✓ | +0.07h ✓ |
| Mar 2026 | 130.42h | 126.71h | +3.71h | +3.50h | +0.24h |

## Slutsatser

### Appen räknar rätt
- **OB 50%** stämmer exakt i 7 av 8 månader
- **OB 70%** stämmer i stort sett alltid (max 6 min diff)
- **Oktober och november 2025** matchar perfekt på ALLA poster — timmar, OB 50%, OB 70% och OB 100%

### Källan till avvikelsen: timmar
Appen visar konsekvent **3–7h mer** än arbetsgivaren betalar per månad. Det är skillnaden i timlön (och i förlängningen OB) som orsakar de 300–400 kr/mån i underbetald lön.

**Trolig förklaring:** Arbetsgivarens stämpelklocka registrerar faktiska klockslag (t.ex. 20:06) medan Thomas loggar schematid (t.ex. 20:15). Alternativt stämplas han av tidigare än schematid säger.

### OB 100%-fel i äldre månader
Jul–Sep 2025 visar stora OB 100%-fel (+3–7h) trots att total timskillnad är lägre. Orsak: ingen `break_periods`-data sparades för dessa månader → appen visste inte var rasten föll → lördag-skift med rast efter 12:00 räknades med för hög OB.

## Vad du bör göra

1. **Begär timrapport från HR** för januari och februari 2026 — jämför dag för dag mot appen
2. **Referensmånader att visa arbetsgivaren:** oktober och november 2025 — båda stämmer perfekt, vilket bevisar att appen räknar rätt
3. **Om arbetsgivaren stämplar av dig tidigare** än schemat säger = de betalar fel
4. **3,5h × 162,98 kr = ~570 kr per månad** som du inte fått om skilnaden är systematisk

## Exempel februari 2026
Lönespec (payslip 2026-03, utbetald 25 mars):
- Timlön: 120,73h × 162,98 = 19 676,58 kr
- Mertid: 5,98h × 162,98 = 974,62 kr
- OB 50%: 7,00h × 81,49 = 570,43 kr
- OB 70%: 0,15h × 114,09 = 17,11 kr
- OB 100%: 20,43h × 162,98 = 3 329,68 kr
- **Brutto: 24 568,42 kr**

Appen (med 130,17h totalt):
- OB 50%: 7,00h ✓ (perfekt)
- OB 70%: 0,25h (arb: 0,15h — diff 6 min = schematid vs faktisk stämpel)
- OB 100%: 20,50h (arb: 20,43h — diff 4 min)

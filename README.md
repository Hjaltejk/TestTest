# Tilbudskøkkenet

En app, der gennemgår de store supermarkeders tilbudsaviser og fortæller dig, hvilke af **dine egne opskrifter** der er mest oplagte at lave lige nu, fordi ingredienserne er billige eller nemme at få fat i.

## Kom i gang

Kræver Node.js 20 eller nyere. Der er ingen afhængigheder at installere.

```bash
npm start          # http://localhost:3000
npm test           # kører testene
```

Appen starter med 10 proteinrige testopskrifter i `data/recipes.json`.

## Sådan virker det

1. **Opskrifter.** Du opretter dem selv under "Mine opskrifter". Hver ingrediens har:
   - **mængde + enhed** (g, kg, ml, dl, l, stk)
   - **normalpris** i kr. pr. kg / liter / stk (det varen typisk koster uden tilbud)
   - **søgeord**, som skal stå i tilbudsavisen, fx `kyllingebryst, kyllingefilet`
   - **udelad**: ord, der gør at et tilbud *ikke* passer, fx `røget, pålæg`
   - **har altid**: krydderier, olie o.l., som ikke tælles med i prisen
   **Importér fra link:** Under "Mine opskrifter" kan du indsætte et link til en opskrift. Appen henter siden, læser opskriften og åbner den i formularen, så du kan rette den til, før du gemmer. Ingredienslinjer som "1 dåse hakkede tomater (400 g)" og "2 spsk olivenolie" omsættes automatisk. Normalpris, søgeord og protein gættes ud fra en indbygget liste over almindelige ingredienser (`src/ingredients.js`). Krydderier, olie o.l. markeres som "Har altid". Ukendte ingredienser får normalpris 0, som du selv skal udfylde. Importen virker med sider, der har struktureret opskriftsdata (schema.org/Recipe), hvilket de fleste store opskriftssider og madblogs har.
2. **Tilbud.** Serveren samler alle søgeord fra dine opskrifter og søger efter dem i tilbudsaviserne via [Tjek](https://tjek.com) (tidligere eTilbudsavis). Tjek dækker bl.a. Netto, Føtex, Bilka, REMA 1000, Lidl, Coop 365, Kvickly, SuperBrugsen og Meny. Tilbuddene caches i 6 timer.
3. **Matching.** Til hver ingrediens finder appen det billigste aktuelle tilbud *pr. kg/liter/stk*. Et tilbud tæller kun, hvis det er billigere end din normalpris.
4. **Rangering.** Hver opskrift får en score fra 0 til 100:
   - 50 % — hvor mange procent du sparer (fuldt point ved 40 % rabat)
   - 30 % — hvor stor en del af indkøbet der er på tilbud
   - 20 % — hvor meget af besparelsen du kan hente i én butik (færre butikker = nemmere)

   Derudover kan opskriften få **bonuspoint for økologi** (se nedenfor).

   Du kan også sortere efter pris pr. portion, protein pr. krone eller største besparelse, og fravælge butikker, du ikke handler i.

5. **Kilde.** Klik på "Se udklip fra avisen" ved en ingrediens på tilbud, eller på en række under "Tilbud". Så ser du udklippet fra tilbudsavisen, ligesom på eTilbudsavis, sammen med butik, gyldighedsperiode, førpris og hvilken side i avisen tilbuddet står på. Klik på udklippet for at se det i fuld størrelse.

### Økologi

Et tilbud regnes som økologisk, hvis titlen eller beskrivelsen indeholder "økologisk", "økologiske", "øko" eller "organic" som et selvstændigt ord ("Økonomipakke" tæller altså ikke). Med valget **Økologi** øverst bestemmer du, hvor meget det skal betyde:

| Valg | Økologisk tilbud vælges, hvis det højst er … dyrere end det billigste | Bonus, hvis hele indkøbet er økologisk |
| --- | --- | --- |
| Betyder ikke noget | 0 % | 0 point |
| Giv lidt ekstra point (standard) | 15 % | +10 point |
| Giv mange ekstra point | 30 % | +20 point |

Bonussen gives efter, hvor stor en del af indkøbet (målt i normalpris) der kan købes økologisk på tilbud. Besparelsesdelen af scoren regnes altid ud fra det billigste tilbud, så det koster aldrig point at vælge økologisk. Et økologisk tilbud skal stadig være billigere end din normalpris for at tælle med.

Hvis appen ikke kan nå Tjek (fx uden internet), bruger den demo-tilbud fra `data/sample-offers.json`. Det står tydeligt øverst på siden.

## Indstillinger (miljøvariabler)

| Variabel | Standard | Betydning |
| --- | --- | --- |
| `PORT` | `3000` | Port for webserveren |
| `OFFER_SOURCE` | `auto` | `tjek`, `sample` eller `auto` (Tjek med demo-data som reserve) |
| `LAT`, `LNG` | København | Din placering, så du får tilbud fra butikker i nærheden |
| `RADIUS` | `20000` | Søgeradius i meter |
| `TJEK_API_KEY` | – | API-nøgle til Tjek, hvis deres API kræver det |
| `OFFER_CACHE_HOURS` | `6` | Hvor længe tilbud caches |
| `IMPORT_ALLOW_PRIVATE` | – | Sæt til `1` for at kunne importere fra lokale adresser (kun til udvikling) |

Eksempel for Aarhus:

```bash
LAT=56.1629 LNG=10.2039 RADIUS=10000 npm start
```

## Projektstruktur

```
server.js                 HTTP-server og API (/api/recipes, /api/offers, /api/ranking)
src/matcher.js            Matching af tilbud mod ingredienser og scoring af opskrifter
src/units.js              Enhedsomregning
src/offers.js             Henter og cacher tilbud
src/providers/tjek.js     Tilbud fra Tjek/eTilbudsavis
src/providers/sample.js   Demo-tilbud
src/recipes.js            Opskrifter (validering og lagring i JSON)
src/importer.js           Import af opskrifter fra links (schema.org/Recipe)
src/ingredients.js        Fortolkning af ingredienslinjer + vejledende priser og protein
public/                   Brugerflade
data/recipes.json         Dine opskrifter
data/sample-offers.json   Demo-tilbud
test/                     Tests (node --test)
```

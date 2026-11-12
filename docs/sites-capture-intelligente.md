# La capture intelligente : les sites qu'elle lit

Recréée le 12/11/2026 (Carnet 1.10.0). Aucune liste de sites n'existait avant :
celle-ci part du code (`src/lib/smart-capture/registry.ts`,
`src/lib/trades-page.ts`) et des plateformes que le Live Club référence. À tenir
à jour à chaque stratégie ajoutée.

Deux choses différentes :

1. **La note** : une stratégie par site extrait ce qui compte de la page (titre,
   chiffres, tableau, transcription), puis la passe secrétaire (Claude) trie.
   Sans stratégie, le repli générique exige un `<article>` ou un `<main>`, ce
   qu'une webapp de trading n'a pas : la note est pauvre.
2. **Les trades (1.10.0)** : après la note, le Carnet relève les tableaux de la
   page. S'il y voit un tableau de trades FERMÉS (colonnes d'instrument, de
   P&L, et une sortie, deux prix ou deux heures), la capture d'écran part à la
   lecture de Pilotage (`/api/pilotage/documents/lire`, mêmes paliers et
   quotas, gardée au coffre), les trades lus passent par l'aperçu de l'import
   (`/api/pilotage/trades/import`) et se rangent au clic sur « Ranger ». Ce
   relevé ne dépend PAS de l'adresse : une plateforme en marque blanche (un
   broker qui habille cTrader, Match-Trader ou DXtrade à son nom) est lue de la
   même façon, si son tableau est un vrai `<table>` ou une grille ARIA.
   Conditions : connecté, et les comptes Pilotage déjà vus par le Carnet.

Légende : **marche** = vérifié ; **à tester** = codé, jamais essayé sur la vraie
page connectée ; **générique** = pas de stratégie, repli ; **non** = rien.

## Plateformes de trading

| Plateforme | Adresse | Note (stratégie) | Trades (1.10.0) | Remarques |
|---|---|---|---|---|
| TopStepX | topstepx.com | marche (`topstepx` : barre du haut BAL/MLL/RPNL, symbole, prix, comptes ; `/stats` : KPI) | à tester | Le tableau Trades n'a jamais été relevé sur la vraie page : on ne sait pas si c'est une grille ARIA. Si non, rien n'est proposé (aucune lecture perdue). Lecture directe sans IA : plus tard (`lireTrades`). |
| Topstep (tableau de bord) | dashboard.topstep.com | marche (`topstep` : KPI du compte, comptes, facturation, payouts) | à tester | Montre surtout des KPI : en général pas de trades, rien proposé. |
| Tradovate | tradovate.com (trader.tradovate.com) | marche (`tradovate` : P&L, win rate, PF par regex sur le texte) | à tester | Les modules Orders / Fills / Performance : leur structure (tableau ou grille) reste à relever. Lecture directe : plus tard. |
| SimpleFX | simplefx.com (app.simplefx.com) | marche (`simplefx` : compte, instrument, tableau de positions par `lireTableau`) | à tester | Le seul lecteur de tableaux mécanique ; onglet « Clôturé » = trades fermés. |
| TradingView | tradingview.com | marche (`tradingview` : titre, légende O/H/B/C, le reste dans l'image) | à tester | Le panneau de trading (Liste des ordres, Historique) d'un broker connecté peut être lu ; le graphique seul ne propose rien (pas de tableau). |
| NinjaTrader (web) | ninjatrader.com | générique | à tester | Routé côté journal (famille plateforme), pas de stratégie dans le Carnet. Le CSV Trades est lu sans IA par l'import. |
| MyFxBook | myfxbook.com | générique | à tester | Routé côté journal comme calendrier ; l'historique d'un compte (tableau) peut être lu. |
| cTrader (web) | app.ctrader.com, marques blanches | générique | à tester | Aucune stratégie. Historique = tableau. |
| MetaTrader 4/5 (web) | web.metatrader.app, terminaux web des brokers | générique | à tester | Aucune stratégie. Le relevé HTML MT4 est lu sans IA par l'import. |
| TradeLocker | tradelocker.com | générique | à tester | Aucune stratégie. |
| Match-Trader | match-trader.com, marques blanches | générique | à tester | Aucune stratégie. |
| DXtrade | dx.trade, marques blanches | générique | à tester | Aucune stratégie. |

« marche » pour la note : stratégies en service depuis la 1.6 à la 1.8, utilisées
par les membres. Aucune des colonnes « Trades » n'a été essayée sur une vraie
page connectée : l'essai du 12/11 s'est fait sur une page de démonstration qui
imite un historique de trades (données factices), avec un journal simulé.

## Autres sites (note seulement)

| Site | Stratégie |
|---|---|
| journal.aoknowledge.com | `journal-aok` (les vraies notes du canvas, par le serveur) |
| youtube.com, youtu.be | `youtube` (description, chapitres, transcription) |
| skool.com | `skool` |
| forexfactory.com, investing.com | calendriers |
| Gmail, Outlook | `email` |
| tout le reste | `generic-article` |
| Vimeo | générique ; routé côté journal (famille cours) |

## Ce que le Live Club référence

Sources lues le 12/11/2026 : les liens utiles du bot (`LIENS_UTILES`,
`apps/journal-d-etude/src/lib/politique-information.ts`, repris dans
`docs/connaissances/liens-utiles.md`), la fiche du Live Club
(`docs/connaissances/live-club.md`), les pages `/live-club` du site v3, et la
base (`cockpit_telegram_messages`, messages du groupe du Live Club : seulement
des comptes de mentions par nom, aucun message lu ni recopié ;
`cockpit_partenaires`).

| Référencé | Où | Mentions dans le groupe (messages / auteurs) | Ce qui sert à la capture | Manque ? |
|---|---|---|---|---|
| Apex Trader Funding | liens utiles (prop firm) | 701 / 117 | Les trades se passent sur Tradovate, Rithmic, WealthCharts, NinjaTrader selon le compte ; le tableau de bord Apex montre des KPI | **Oui** : aucune stratégie pour le tableau de bord Apex (apextraderfunding.com). Les trades : via la plateforme (Tradovate couvert, WealthCharts et Rithmic non). |
| Topstep / TopStepX | liens utiles (prop firm) | 450 / 95 (dont 41 / 23 « TopstepX ») | TopStepX, dashboard.topstep.com | Non (couverts) ; trades à tester. |
| TradingView | liens utiles (analyse) | 354 / 117 | tradingview.com | Non. |
| Tradovate | liens utiles (broker) | 256 / 78 | tradovate.com | Non ; trades à tester. |
| Rithmic (R Trader) | groupe seulement | 91 / 36 | R Trader Pro est une application de bureau : pas de page web à capturer | **Oui** pour sa version web s'il y en a une chez le membre (à vérifier) ; sinon export CSV par l'import. |
| My Funded Futures | liens utiles (prop firm) | 75 / 18 | Plateformes Tradovate, NinjaTrader, Rithmic ; tableau de bord myfundedfutures.com | **Oui** : aucune stratégie pour le tableau de bord. |
| Lucid Trading | groupe seulement | 69 / 25 | Tableau de bord de la prop firm | **Oui** : aucune stratégie. |
| FTMO | groupe seulement | 53 / 31 | MetaTrader, cTrader, DXtrade selon le compte | Couvert par le relevé générique (à tester) ; aucune stratégie de note. |
| Vantage | groupe et site (articles) | 49 / 21 | Broker MetaTrader | Générique (à tester). |
| NinjaTrader | liens utiles (analyse) | 32 / 15 | Bureau surtout ; version web | Générique (à tester). |
| MetaTrader | liens utiles (analyse) | 27 / 15 | Terminal web | Générique (à tester). |
| Phidias | liens utiles (prop firm) | 20 / 11 | Tableau de bord ; plateformes à vérifier | **Oui** : aucune stratégie. |
| Tradeify | groupe seulement | 17 / 8 | Tableau de bord ; plateformes à vérifier | **Oui** : aucune stratégie. |
| RaiseFx | partenaire broker du Live Club (`cockpit_partenaires`, fiche Live Club) | 10 / 5 | Plateforme à vérifier (MetaTrader ou web trader du broker) | **À vérifier** : sa plateforme n'est écrite nulle part dans le code. |
| AMP Global | liens utiles (broker) | 7 / 4 | Plateformes tierces (CQG, Rithmic...) | Générique. |
| WealthCharts | groupe seulement | 5 / 5 | Plateforme web (comptes Apex notamment) | **Oui** : aucune stratégie ; relevé générique à tester. |
| Quantower, ATAS, Sierra Chart, Bookmap | liens utiles (Quantower) et groupe | 2 à 6 chacun | Applications de bureau | Hors capture de page : exports par l'import (Quantower lu sans IA). |
| SimpleFX | liens utiles (broker) | 1 / 1 | app.simplefx.com | Non (couvert). |
| Degiro, Revolut | liens utiles (investissement) | 0 et 15 / 8 | Pages web d'investissement, hors trading actif | Non prioritaire. |
| Edgyx | partenaire (journal de trading) | 54 / 9 | Pas une plateforme de trading | Non. |
| cTrader, TradeLocker, MyFxBook, Volumetrica, Alpha Futures, Take Profit Trader, Bulenox | groupe, rarement | 1 à 7 chacun | Selon le cas | Générique. |
| DXtrade, Match-Trader, MotiveWave | jamais cités | 0 | | Générique. |

Mentions : nombre de messages du groupe qui contiennent le nom (expression
régulière insensible à la casse, « Apex » et « Topstep » peuvent compter
d'autres sens), et nombre d'auteurs différents. Période : tout ce que
`cockpit_telegram_messages` garde.

### Ce qui manque, par ordre d'intérêt

1. **TopStepX et Tradovate en vrai** : relever leurs tableaux de trades sur des
   pages connectées (structure DOM, grille ARIA ou non), puis écrire la lecture
   directe sans IA (`lireTrades` de la stratégie, porte ouverte en 1.10.0).
2. **Les tableaux de bord des prop firms citées** (Apex, My Funded Futures,
   Lucid, Phidias, Tradeify) : aucune stratégie de note.
3. **WealthCharts** (comptes Apex) : plateforme web sans stratégie.
4. **RaiseFx** : savoir sur quelle plateforme tradent les membres arrivés par
   ce broker.

# TODO — Le Carnet du Trader (extension)
<!-- ontologie: id=ch-todo-extension; statut=actif; concerne=extension,mentorat-ia,carnet-premium,ou-anthropic -->

## ✅ v1.8.1 — CAPTURE INTELLIGENTE IA, en deux temps (30/08/2026)

Clôt le backlog « capture intelligente à retravailler » du 17/07 et l'orientation
Brice du 27/08 (« remplacer par de la vraie IA, appel via le backend, l'extension
ne décide jamais »). Zip généré : `D:\8_Developpement\le-carnet-du-trader-v1.8.1.zip`
(39 fichiers, 23,9 Mo, manifest 1.8.1, clé dev retirée, 0 secret — le seul JWT du
bundle est la clé anon Supabase, publique par construction).

**Le découpage en deux temps** (idée de Brice, 30/08). La capture IA ne donne plus
d'avis par défaut :

1. **Secrétaire** — extrait et trie ce que la page dit vraiment. Aucun jugement,
   aucun chiffre inventé, un champ `manquant` quand la lecture est partielle.
   Tourne pour TOUS les paliers, sur Haiku 4.5. Automatique, avec repli silencieux
   sur les heuristiques dès qu'on n'a pas un 200.
2. **Étude** — bouton « Étudier la note », relit la note dans le cadre de
   l'académie et écrit la lecture DANS la note. Opus 5. Réservée aux paliers
   payants. Déclenchée à la main : la lecture n'est voulue qu'une fois sur cinq,
   et elle vaut le plus au moment de la relecture, deux semaines après.

Ne remplace PAS `analysis-providers.ts` (« L'avis Ao Knowledge ») : celui-là fait
lire la note par l'IA PERSONNELLE de l'élève, dans un onglet, et la réponse reste
là-bas. Les deux coexistent.

**Mesuré au banc du 30/08** sur des pages réelles (SimpleFX de Brice, Ch11 du module
journaling Skool, ses captures TradingView et YouTube), 15 appels, 0,21 € :
- Coût par capture : Opus 2,90 ct · Sonnet 1,13 ct · Haiku 0,44 ct en mode
  secrétaire. Haiku NE MET PAS le socle en cache (préfixe minimum > 2 000 jetons),
  contrairement à Opus et Sonnet.
- Haiku inventait sur deux pages sur deux en mode « donne ton avis » (une stat sur
  les trades de l'élève tirée d'une page de COURS). En mode secrétaire, plus rien.
  Le problème n'était pas le modèle, c'était le travail qu'on lui donnait.
- Sur le TradingView de Brice, Opus a lu sur le JPEG l'outil de position (entrée
  29 656,25 / stop 30 706 / cible 25 270, R:R 4,18), le dealing range et la grille
  de retracement, puis relevé deux erreurs classiques de la doctrine : cible non
  rattachée à une liquidité nommée, et liquidité possible derrière le stop.

**Côté journal** (voir son TODO) : `/api/capture`, `/api/capture/analyse`,
`/api/capture/acces`, brique budget en euros sur fenêtre glissante de 30 jours.

**Sélecteur de modèle pour l'étude** (ajouté le 30/08 au soir, dans « Configurer
son IA ») — les trois modèles sont listés ; ceux hors palier restent **visibles
avec un cadenas** et l'étiquette du forfait qui les débloque, pour mettre en
avant l'offre supérieure. Club : Opus + Sonnet + Haiku, défaut Opus. Premium :
Sonnet + Haiku, défaut Sonnet, Opus cadenassé. Libre : tout cadenassé. La capture
n'est pas concernée, elle reste sur Haiku pour tous.

Ce qui empêche ce sélecteur d'être décoratif : **le nombre d'études restantes
s'affiche en face de chaque modèle débloqué** (club à budget plein : 117 sur
Opus, 333 sur Sonnet, 571 sur Haiku). L'écart de qualité entre modèles sur une
étude est mince, l'écart de coût est d'un facteur cinq — descendre en gamme
devient un arbitrage réel au lieu d'une punition. Le client PROPOSE
(`settings.modeleEtude`), le SERVEUR DISPOSE : une préférence hors palier
retombe sur le défaut du palier, vérifié.

**Côté extension** :
- `src/lib/capture-ia.ts` — raccord, repli, HTML→texte, payload envoyé au modèle.
- `src/lib/sync.ts` — `fetchAccesCaptureIA`, `capturerAvecIA`, `etudierNoteAvecIA`.
- **SimpleFX** (`strategies/simplefx.ts`) — NOUVEAU. 5e site le plus capturé
  (11 captures en base) et aucune stratégie jusqu'ici : ça tombait sur le fallback
  générique, qui exige un `<article>` qu'une webapp de trading n'a pas. Lecteur de
  tableaux générique (vrais `<table>` ET grilles ARIA), compteurs d'onglets, état
  du compte, période filtrée, et surtout « N lignes lues sur M annoncées » quand le
  tableau déborde de la zone visible. Le lecteur resservira à Tradovate et TopStepX.
- **YouTube** — la description était perdue : les sélecteurs visaient
  `yt-formatted-string`, d'avant la refonte. Elle est maintenant lue à la source
  dans `ytInitialPlayerResponse` (le texte d'un `<script>` est accessible depuis le
  monde isolé, pas les variables globales), donc ENTIÈRE et non tronquée par le
  « ...more », avec la durée et les chapitres ancrés en début de ligne.
- **TradingView** — `Prix : —` était vide et les points clés se résumaient à
  `Chart Time` et `User Time`. Prix et OHLC lus dans la légende (O/H/B/C en
  français), horloges renvoyées dans les métadonnées, mention explicite que les
  niveaux tracés sont sur la capture d'écran et pas dans la page.
- Le titre n'est plus réinjecté dans le corps de la note (cause de la triple
  répétition vue en 1.7.1), et le screenshot n'est plus pris deux fois en
  fullscreen.

**PRÉREQUIS — TOUS LEVÉS le 30/08/2026 au soir :**
1. ✅ Migration `sites/Aoknowledgecom/supabase/migrations/20260830230000_ia_budget_capture.sql`
   **APPLIQUÉE** (les 5 ordres passés, colonnes et index vérifiés en relecture).
   Le fichier a été déplacé depuis `prisma/migrations-manual/` : le garde-fou de
   `appliquer-migration.sh` n'accepte que le dossier canonique, et la base du
   journal est bien ce projet Supabase (`aws-0-eu-west-3.pooler.supabase.com`).
2. ✅ `ANTHROPIC_API_KEY_CARNET` confirmée dans Vercel `journal-d-etude-beta`.
3. ⏳ Charger le zip 1.8.1 sur le Store. **Brice travaille sur Windows**, le Mac
   ne sert qu'en déplacement : ne plus écrire « depuis son Mac » dans les notes.

**VÉRIFIÉ BOUT EN BOUT le 30/08 contre la vraie base et la vraie clé** : palier
résolu (club, via le grant manuel — le cockpit ne connaît pas brice.d@ comme
client), budget lu (0 € sur 4 €), appel Haiku réel (5,3 s), ligne `AiUsage`
écrite avec les colonnes de cache, `costMicros` et `niveau`, jauge qui bouge
(0,00461 €). La chaîne est bouclée.

Budgets par défaut, surchargeables sans redéployer (`IA_BUDGET_LIBRE`,
`IA_BUDGET_PREMIUM`, `IA_BUDGET_CLUB`, `IA_PLAFOND_GLOBAL_LIBRE`) :
libre 0,25 € · premium 1,40 € · club 4 € par 30 jours glissants, plus un plafond
global de 50 € sur le niveau libre. À revoir sur les relevés réels après trois
semaines : le quota est un pare-feu, pas un prix.

## ✅ v1.8.1 (suite) — LE MENTORAT DEVIENT UNE CONVERSATION

Version 1.8.1 et non 1.9.0 : arbitrage Brice, la 1.8.0 n'a jamais été publiée et
on modifie de l'existant. Les deux livrent ensemble.

**La conversation est une NOTE ÉPINGLÉE**, « Mentorat AOK » (idée de Brice). Pas
d'objet « conversation » inventé : elle se synchronise, s'exporte et se relit
comme les autres, et l'élève peut y écrire pour lui-même entre deux échanges.
Les réponses du mentor portent le tag `mentor` sur leur bloc — aucun type de
bloc nouveau, aucune migration.

**L'épinglage n'existait pas.** Champ `pinned` sur `AcademicNote` et
`NoteSummary`, tri en tête dans `getNoteSummaries`. Local à l'extension : c'est
un confort de navigation, pas une donnée d'étude, le journal n'a pas besoin de
la colonne.

**Le déclencheur** (la question que Brice a posée : chaque message ne doit pas
appeler l'IA, l'élève doit pouvoir prendre des notes dans le fil) — écrire est
GRATUIT, demander est un GESTE. « Écrire » pose le texte dans la note sans qu'un
jeton parte. « Demander au mentor » envoie TOUT ce qui a été écrit depuis la
dernière réponse, pas seulement la dernière ligne : on écrit dans un carnet par
petits bouts, on réfléchit, puis on demande une fois. C'est la même grammaire que
la capture, où le secrétaire écrit et l'étude demande.

**Côté journal** : `POST /api/mentorat/chat`, déployée et vérifiée en ligne. Le
serveur ne stocke pas le fil, il répond à un tour. Même palier et même enveloppe
budgétaire que l'étude. Fil borné à 20 tours, le brief chiffré portant déjà
l'historique long.

**Vérifié contre la vraie clé** : 2,1 centimes l'échange, 10 s. Le mentor a
utilisé les chiffres du brief sans en inventer, n'a pas cité le cadre comme un
document, n'a pas félicité, et a reporté explicitement un sujet secondaire. Deux
messages écrits d'affilée ont bien été traités comme une seule pensée.

**Reste ouvert de ce chantier** : la 5e entrée dans « Analyser avec une IA » pour
partir vers le mentorat sans quitter l'extension. Moins urgente maintenant que le
fil vit dans l'écran mentorat.

**Reste ouvert** : les blocs `meta` (les métadonnées vivent encore dans le contenu
plutôt que dans des blocs dédiés) ; le rapprochement positions clôturées ↔ trades
documentés (« tu as clôturé 7 positions mardi, 2 sont documentées ») ; le masquage
des données de compte avant envoi à l'API ; le mode session.

## Deux fils rouverts par Brice le 01/09/2026 (relecture de la release note)

Les deux sont sortis de la relecture, pas d'un bug : il a lu ce qu'on annonçait
et a dit « il faudra revenir dessus ». À traiter avant de parler de 1.9 — sa
règle, posée dans la note elle-même : **pas de 1.9 tant que l'IA n'est pas
alignée avec la vision**, les 1.8.x servent à ça.

### La qualité des points clés (précisé par Brice le 01/09)

**Le cadre.** Le carnet est un CAHIER DE COURS : ce qu'on y cherche est de
l'information éducative. Résumé et points clés doivent se lire comme sur un
article de blog — le texte, et sur le côté ce qu'il faut en retenir.

**Un mauvais point clé est une étiquette** recopiée de la page (titre de card,
intitulé, ligne de ticker). **Un bon point clé est ce que la page apprend**,
écrit pour tenir tout seul à la relecture deux semaines plus tard.

Attention à la tension avec la règle du secrétaire (aucun avis, aucune
invention — c'est elle qui a tué les hallucinations au banc du 30/08).
« Apprendre quelque chose » ne veut pas dire interpréter : ça veut dire
**extraire du sens au lieu de recopier des libellés**. Le concept enseigné
plutôt que le titre du chapitre ; la relation entre deux niveaux plutôt que les
deux nombres côte à côte.

- [ ] **Demander à Brice ses exemples** de points clés « tels qu'il les aurait
      notés », sur des pages réelles. Il l'a proposé lui-même : sans ça il n'y a
      pas de base pour régler la consigne. Même dictés en vrac.

- [ ] **La famille « maison » doit lire le journal, pas le gratter.** Correction
      de Brice, et j'avais tort dans l'autre sens : j'avais proposé qu'un canvas
      de 111 notes « n'a rien à enseigner et devrait le dire ». Faux. Le canvas
      EST du contenu, et surtout **c'est NOTRE contenu** : le carnet est connecté
      au journal, donc rien n'empêche d'aller chercher la vraie note derrière
      chaque carte affichée, de la lire, et d'en tirer de vrais points clés — ou
      de restituer **les liens entre les éléments** que l'élève a reliés sur le
      canvas. Un canvas VIDE serait une autre histoire, mais ce n'est pas le cas.

      **Faisable tel quel, vérifié le 01/09** : dans `NoteMapCanvas.tsx` (~l.940)
      le nœud React Flow porte `id: note.id`, et React Flow expose cet id en
      `data-id` sur `.react-flow__node`. Mécanisme :
      1. la stratégie « maison » de l'extension relève les `data-id` visibles ;
      2. elle les envoie à `/api/capture`, qui tourne déjà sous l'identité de
         l'élève ;
      3. le serveur résout ces ids en notes DE CE COMPTE (jamais d'un autre) et
         donne leur contenu au modèle au lieu du DOM.
      Les arêtes du canvas se relèvent de la même façon pour les liens.

- [ ] **La capture intelligente n'est pas satisfaisante.** Verdict de Brice le
      01/09 après usage réel, sans détail à ce stade (« je reviendrai dessus
      plus tard »). Ne pas deviner : lui demander sur quelles pages et sur quoi
      précisément avant de toucher aux prompts. Piste déjà visible dans ses
      captures d'écran du jour : sur SimpleFX, le résumé décrit la page (« deux
      graphiques US100 en 1h et 15m ») au lieu de lire la situation du compte,
      et les points clés remontent surtout du contenu déjà présent dans la note
      plutôt que de la page captée.

- [x] **La superposition au survol entre deux blocs.** ✅ **FAIT en 1.8.4** — confirme par Brice le 01/09 : disparait au depart du curseur, image intacte au rechargement. Le glyphe translucide devient une pastille pleine (bg-background) et les traits passent en h-px. Diagnostic conserve ci-dessous. Le correctif 1.8.3 a
      réglé la PERTE (une capture collée dans le ＋ ne s'enregistrait pas) mais
      pas l'affichage : Brice la revoit le 01/09. Repro donné par lui — ajouter
      une capture par la zone de texte du ＋, puis passer le curseur entre deux
      blocs. Écarté : ce n'est PAS un stockage en double, `note.content` n'est
      rendu que s'il n'y a aucun bloc (`CurrentNoteView` ~l.844). Candidat :
      dans `InsertPoint`, la bande de survol fait `h-2.5` (10 px) avec `-my-1`
      et contient un `＋` de 12 px plus deux traits — le contenu déborde et se
      peint sur les blocs voisins. Invisible au-dessus du texte, très visible
      au-dessus d'une image. **Reste à confirmer** : est-ce que ça disparaît
      quand le curseur s'éloigne ? Si oui c'est bien ça.

- [x] **Cadrer le mentorat sur un dossier ou un sous-dossier.** ✅ **FAIT en
      1.8.4 (01/09/2026)**, forme retenue par Brice : des cases à cocher à
      l'initialisation du mode, rien de coché = tout le carnet. Côté journal,
      `buildMentoratBrief(userId, days, dossiers?)` filtre les notes (donc les
      trades et warmups, qui vivent en JSONB dessus) et re-filtre en mémoire
      les annotations et le retard de relecture (`noteId` est nullable, un
      filtre SQL perdrait les jugements de trade). Les trois routes mentorat
      lisent le cadrage. **Sans effet tant que le journal n'est pas déployé.**
      Ancienne formulation du fil, conservée pour mémoire :
      **Cadrer le mentorat sur un dossier ou un sous-dossier.** Idée et
      justification de Brice : les élèves ont des usages très différents dans la
      même extension, des dossiers pour le trading et d'autres pour du perso.
      Aujourd'hui `buildMentoratBrief` balaie tout le compte sur N jours ; il
      faut pouvoir dire au mentor « ne regarde que ce dossier-là ». Annoncé
      publiquement comme une réflexion en cours dans la release note 1.8.3,
      donc attendu, mais sans date promise.
      Touche : `journal-d-etude/src/lib/mentorat-brief.ts` (filtre par dossier),
      la route `/api/mentorat/chat`, et un sélecteur côté `MentoratView`.

## Priorités (ordre validé par Brice le 10 juillet 2026)

0. ~~**Pont Edgyx**~~ ❌ **ANNULÉ le 27/08/2026** (décision Brice) : Geoffrey n'a
   jamais vraiment répondu au dossier d'analyse (`docs/edgyx-bridge/`). On ne le
   mentionne plus ; ne rouvrir que s'il revient de lui-même vers Brice.
1. ~~🐛 Bug content-script~~ ✅ **corrigé le 10/07/2026**
2. ~~Warmup à la demande, multi-séances~~ ✅ **fait le 10/07/2026**
3. *(côté journal : homogénéisation du shell UI — voir TODO du journal)* ← prochaine tâche
4. ~~Fonctionnalité DOL — Draw on Liquidity~~ ✅ **fait le 10/07/2026** (v1.6.2, voir plus bas)
5. *(côté journal : compteur de journalisation des concepts)* — la même donnée sert aussi
   à l'agrégation du mode mentorat (section 8) : moins cosmétique qu'il n'y paraît.

## Reprises de l'ancienne ROADMAP (audit du 27/08/2026)

La `ROADMAP.md` racine (avril 2026) a été archivée. **Arbitrage Brice du
27/08/2026** sur ce qui y restait d'ouvert côté extension :

- [x] **Dictée vocale Whisper** ✅ **FAIT le 28/08/2026 (v1.7.0, zip généré, À DOGFOODER)** :
      bouton micro dans la capture bar, Whisper small via @huggingface/transformers
      dans un Web Worker (WebGPU si dispo, wasm sinon), 100 % local. Modèle
      (~170 Mo) téléchargé au 1er usage puis en cache. Runtime onnx embarqué
      dans le zip (conformité CWS : pas de code distant → zip 0,6 → 15 Mo).
      Reste à valider en réel : le prompt micro du sidepanel et la qualité du
      français (si small déçoit : passer à medium, ou base si trop lent).
- [ ] **GARDÉ — Transcription vidéo auto** (réutilise la brique dictée : même
      worker Whisper, il ne manque que l'extraction audio de la vidéo).
- [ ] **GARDÉ (redimensionné) — Éditeur** : pas le gros chantier « éditeur
      enrichi » d'époque, mais quelques **correctifs et ajustements
      esthétiques** sur une partie de l'éditeur (liste précise à collecter
      auprès de Brice).
- ~~Tests Vitest, CI/CD, assets marketing CWS~~ → **classés par Brice le
  27/08** (« tout le reste est déjà fini et classé »). Ne pas les re-proposer ;
  ne rouvrir que sur demande explicite.
- ~~Bugs prod « ❓ Smart Capture » (FullscreenApp, filtres Skool)~~ →
  obsolètes : la capture intelligente sera remplacée par la capture IA
  (cf. backlog ci-dessous), on ne débogue plus l'ancienne.

### ✅ Demande élève — sous-dossiers, 1 niveau — FAIT le 28/08/2026 (v1.6.12)

Créer des dossiers DANS un dossier, un seul niveau de profondeur.
- **Extension** (commit `b36a09a`) : `NoteFolder.parentId`, borne de
  profondeur appliquée à l'ÉCRITURE dans `saveFolder` (parent inexistant,
  non-racine ou cycle → le dossier retombe racine), suppression d'un
  parent = sous-dossiers promus racine (jamais de cascade). Historique :
  bouton sous-dossier au survol d'une racine, rendu imbriqué, drag&drop
  de notes sur les sous-dossiers.
- **Sync** : le payload note porte `folderParentId`/`folderParentName`
  (toujours présents, null = racine — permet aussi de dé-nester) ; le
  pull restaure racines d'abord puis met à jour le parentId des dossiers
  déjà connus (multi-appareils).
- **Journal** (commit `fb2bc52`, déployé ; colonne `Folder.parentId`
  appliquée en base le 28/08) : parent upserté avant l'enfant, profondeur
  bornée côté API aussi (jamais d'enfant sous un dossier qui a un
  parent), parentId intouché si le champ est absent (extensions ≤1.6.11).
  Affichage « Parent / Sous-dossier » dans /notes et /review.

> 📌 Règle de versionnage actée le 17/07 (Brice) : **une version = une livraison
> chargée par Brice**, pas une itération interne. Les correctifs d'une même
> session de travail restent dans la même version tant que le zip n'a pas été
> installé/publié. (Les bumps 1.6.8/1.6.9 de cette session ont été reconsolidés
> en 1.6.7 — entrée unique dans le changelog du guide.)

### ✅ v1.6.7 — contrat de données 0.1.2 + fix popup (17/07/2026, zip généré)

- Nouveau type de bloc **`meta`** (date • titre • URL de capture) : jamais du
  contenu — ligne discrète dans l'extension, masqué par défaut côté journal
  (œil pour afficher), jamais recopié dans `note.content`, exclu du canvas.
- **Screenshot avec note ouverte** : l'image + sa métadonnée partent
  DIRECTEMENT dans la note en blocs image+meta — la capture bar reste propre
  (avant : tout était injecté dans l'éditeur, cf. capture d'écran de Brice).
- **🐛 Popup de suppression réparé** : le `ConfirmDialog` n'était rendu que
  dans la branche texte de `MessageBlock` — supprimer une image ou un long
  texte replié ne montrait RIEN. Dialog ajouté aux trois branches.
- Sync : les blocs texte vides ne partent plus (l'API journal les refuse
  aussi) ; nettoyage one-shot fait en base (59 supprimés).

Inclus aussi dans la v1.6.7 (même livraison) :
- Bouton « Métadonnées » (œil) dans la vue note — visible par défaut dans
  l'extension, masqué par défaut dans le journal. Côté journal : 185 blocs
  meta legacy migrés en base + normalisation à la sync.
- **Rattrapage auto des notes en attente** — l'auto-sync à la sauvegarde
  échouait en silence (session absente/expirée) et rien ne réessayait → les
  notes restaient « à synchroniser » jusqu'au clic manuel. Désormais : à
  l'ouverture du panel connecté, elles partent toutes seules.
- **Cache local des uploads d'images** (hash → URL, chrome.storage.local) —
  avant, CHAQUE sync recompressait et re-téléversait toutes les images même
  déjà en ligne, d'où « Envoyer les nouvelles » aussi lent que « Tout
  renvoyer ». Une image déjà envoyée ne repart plus jamais.

### 📋 Backlog — capture intelligente à retravailler (noté le 17/07/2026)

> 🔄 **Orientation Brice (27/08/2026)** : ne pas rafistoler l'existant — remplacer la
> capture intelligente par de la **vraie IA** (jetons Anthropic, appel via le backend).
> Modèle à deux niveaux : **abonné** (mode mentorat) = bouton capture intelligente
> propulsé par IA ; **non abonné** = le fetch basique actuel, qu'on peut quand même
> améliorer. Cohérent avec l'architecture mentorat (contrôle d'accès par le backend,
> l'extension ne décide jamais). **À faire APRÈS la mise en place du mode mentorat.**

- [ ] La smart capture injecte encore un tas de métadonnées dans le CONTENU
      (préfixe `<strong>pageTitle</strong>`, blocs « Prix : », « RPNL : »,
      résidus « 💬 53 »…). À faire migrer vers des blocs `meta` / champs
      structurés quand on retravaillera la capture intelligente. (Décision
      Brice : pas prioritaire, on s'en fiche un peu pour l'instant.)
- [ ] Pouvoir taguer un bloc `meta` n'a pas de sens — vérifier que l'UI ne le
      propose pas quand on retravaillera la capture.

> ⚠️ AVANT de générer le zip v1.6.2 et AVANT tout push : voir
> `docs/v1.6.2-drive-oauth.md` (Codex). Il reste 3 actions à faire avec Brice :
> créer le client OAuth « Chrome Extension » + renseigner le client_id,
> **roter l'ancien secret Drive** (compromis, embarqué ≥ v1.4.7), et
> **nettoyer l'historique git** (le secret vit dans les commits v1.6.1
> `3d6d872`/`9131321`, non poussés → GitHub Push Protection bloquera sinon).

### 6. Prompts d'analyse IA — chaîne logique (16/07/2026)

Les anciens prompts (« analyse neutre », « mentorat », « orienté action ») étaient
trois variantes parallèles faites par défaut. Remplacés par une **chaîne**.

- ✅ **Prompt libre** — inchangé, remonté en premier.
- ✅ **1. Lancer la conversation** (`init`) — pose le rôle de l.IA + la clé de
      lecture d'une note (A/B/C = qualité de la décision et JAMAIS le résultat,
      warmup/cooldown, DOL). **Part AVEC la note et son PDF** (il cadre l IA ET sert de premier etat des lieux — decision de Brice 16/07) — cf. `isOpener`, qui ne sert plus qu a l encart d aide.
- ✅ **2. Débriefer une séance** (`update`) — l'usage courant dans une conversation
      déjà cadrée : points saillants, **évolutions** depuis les notes précédentes,
      **angles morts**, écarts A/B/C vs résultats, UNE priorité. Sélectionné par défaut.
- ✅ **3. L'avis Ao Knowledge** (`aok`) — LIVRÉ le 17/07 (v1.6.5 / 1.6.6). Joint la
      note ET la doctrine (`public/doctrine-ao-knowledge.md`, embarquée dans le bundle).
      Signale les écarts avec son avis spontané, ne comble pas les trous, et NE CITE
      JAMAIS le document (immersion de l'élève). Testé en réel : la doctrine est bien
      lue par ChatGPT.
- [ ] **4. Plan d'évolution** — ce n'est PAS un 4e prompt : c'est le **mode mentorat**
      payant, voir section 8. L'IA propose, Brice valide.

#### Prérequis du prompt 3 : le document de doctrine

**Corpus cartographié le 16/07/2026** (ne pas repartir de zéro, ne pas s'arrêter
à la première source — c'est l'erreur commise) :
- `D:\1_Ecriture\Systeme\archives-anciens-textes\chatgpt\verbatims-brice\` — 100
  fichiers de dictées brutes, dont **`000-corrections-et-exigences.md`** : 369
  corrections de Brice + une **hiérarchie de fiabilité** des archives. Pièce
  maîtresse (« une correction ne ment jamais »).
- `...\chatgpt\eleves\methode-etm.md` + `D:\3_Pedagogie\ETM - Elite Trader
  Mentorship\Document de Référence Onboarding ETM.docx` — la méthode.
- `D:\3_Pedagogie\PDF - workbook\` (e-books), `Masterclass\` (dont « Perte »),
  `FORMATION Aok\`.
- `D:\1_Ecriture\Systeme\` : `instructions-portables.md` (voix déjà distillée),
  `fiche-de-style.md`, `MANIFESTE.md`, `prompt-reference-brice-v11.md`, `echantillons\`.
- Google Drive : ~20 sessions « … Coaching ETM /w Brice — Notes par Gemini ».
  ⚠️ Le **verbatim complet est DANS ces docs** (sous le résumé), horodaté et avec
  les locuteurs (`**Brice DELANNAY:**`). Les fichiers « Transcription » ne sont
  que le chat texte (inutilisables).
- `apps/.../v3/public/transcripts/` — 352 transcriptions YouTube, déjà publiées
  (`aoknowledge.com/transcripts/*.txt`, HTTP 200).
- Volumineux et à ne PAS charger en contexte principal : `chatgpt\export\` (142 Mo),
  `chatgpt\dumps\` (11,6 Mo).

⚠️ **Contrainte de confidentialité** : les coachings sont des séances privées de
clients nommés (leurs pertes, leur psychologie). La doctrine sera publique → elle
ne doit contenir **aucune donnée d'élève** : pas de noms, pas de cas, pas de
chiffres, pas de citation identifiable. Filtrer sur les tours de parole de Brice
ne suffit pas : ses répliques évoquent leur situation. Réécrire en principes.

**Livraison du doc à l'IA** (décidé avec Brice) : ne PAS compter sur l'IA pour
naviguer vers une URL (toutes ne le font pas, et une page web lue par une IA est
un vecteur d'injection). C'est **l'extension qui récupère le doc et le joint** à
la conversation, comme elle joint déjà le PDF de la note → marche sur n'importe
quelle IA, reste relisible, toujours à jour, et contenu contrôlé de bout en bout.
Piste bonus : joindre les transcriptions correspondant aux `concepts` de la note.

### 8. 💰 Mode mentorat — la première monétisation de l'extension (idée Brice, 17/07/2026)

> 🚧 **AVANCEMENT (28/08/2026)** :
> - ✅ **Étape 1 — le brief compressé** : `GET /api/mentorat/brief?days=N` (journal
>   `1fb8ef4`, déployé). Calcul pur depuis la base : trades, A/B/C, causes,
>   calibration, warmups×émotion, erreurs cooldown, concepts, retard de
>   relecture + rendu texte ~15 lignes. Testé sur les données réelles de Brice.
> - ✅ **Étape 2 — panel mentorat v0 dans l'extension** (`4271b05`, v1.7.0) :
>   bouton 🎓 au footer, cartes chiffrées (trades, jugements, causes,
>   calibration, relectures en retard), période 30/90/180 j, brief texte avec
>   bouton Copier (à coller dans la conversation IA). Pas de gating encore.
> - ✅ **Étape 3 — le plan d'évolution (notre IA), CODÉ le 28/08** (journal
>   `967fd80` déployé + extension `57bff9b`) : `POST /api/mentorat/plan` (brief →
>   proposition, cadre ETM générique v1, table MentoratPlan statut `proposed`),
>   section « Plan d'évolution » dans le panel. AUSSI CODÉ : **support IA**
>   (`/api/support/chat` + `/api/support/escalate`, SupportView bouée dans
>   l'extension, fils SupportThread en base) et **AiUsage** (chaque appel Claude
>   loggé par membre : la source de l'écran cockpit). ⏳ EN ATTENTE pour tester :
>   Brice pose `ANTHROPIC_API_KEY_CARNET` et `ANTHROPIC_API_KEY_SUPPORT` dans
>   Vercel (journal-d-etude-beta) — d'ici là les routes répondent 503 avec un
>   message clair. Modèles par env `AI_MODEL_MENTORAT`/`AI_MODEL_SUPPORT`
>   (défaut claude-opus-5 ; passer le support à claude-haiku-4-5 = ~10× moins
>   cher, décision Brice). La doctrine ETM payante (question 3) remplacera le
>   cadre générique du plan.
> - ✅ **Étape 4a — GATING PAR ABONNEMENT, FAIT le 28/08** (journal `3e9b418` +
>   extension `5e79ba9`) : le 🎓 passe par un portail (pas connecté → se
>   connecter ; sans droits → écran d'upgrade avec CTA Live Club + renvoi
>   support). Droits = Live Club actif OU Skool premium/vip (lus dans les
>   tables cockpit_*, match par TOUS les emails du membre) OU grant manuel
>   (table `MentoratGrant` — anciens formats 3000 €, cas particuliers ; le
>   grant de Brice est posé). Le serveur re-vérifie brief et plan en 403 :
>   l'extension ne décide jamais. Un inscrit newsletter n'a pas accès.
>   Pour accorder un accès à la main : INSERT dans MentoratGrant (email, note).
> - ✅ **Étape 4b — CARNET PREMIUM CRÉÉ ET BRANCHÉ le 28/08** (journal `59d1ec0`
>   + extension `20fa7d4`) : produit Stripe `prod_V9jniZCCbIJsmV` sur le compte
>   AOKNOWLEDGE (décision Brice : à l'inverse du Live Club chez Mélanie — la
>   redistribution s'inverse, Brice encaisse et reverse ; compta Adil), prix
>   5,99 €/mois « Lancement » (`price_1U9QKMEAT4qWdUNVv0OSIusl`), Payment Link
>   https://buy.stripe.com/fZucN51ma7Iz0vP2wp7ok00 branché sur le bouton
>   « Passer en Premium » de l'écran d'upgrade. `checkMentoratAccess` reconnaît
>   les abonnés en DIRECT via l'API Stripe (accès dans la minute après
>   paiement, raison `carnet-premium`). ⏳ UN GESTE BRICE pour activer cette
>   reconnaissance : poser `STRIPE_KEY_CARNET` dans Vercel journal-d-etude-beta
>   (= la clé restreinte « Cockpit AOK » du compte aoknowledge, celle de
>   `credentials.local/stripe-api.local.json`) + Redeploy. Sans elle, le
>   paiement marche mais l'accès n'est reconnu que par le cockpit du lendemain.
>   ⚠️ Piège connu : l'abonné doit payer avec l'email de son compte AOK, sinon
>   grant manuel via le support. Page de vente site : APRÈS, pas bloquant.
>   Créé via la clé Cockpit AOK élargie (Products+Payment Links en écriture).
> - Grants manuels posés le 28/08 : brice.d@ (propriétaire) et
>   melaniesommer93@yahoo.com (équipe — Mélanie).
> - La question 3 (contenu doctrine ETM / interactions) reste la conversation
>   produit à avoir — voir « Les questions encore ouvertes ».

> À mettre en place **prochainement**, pas dans deux ans. C'est toute une conversation à
> avoir : ce qui suit est la capture de l'intention, pas une spec validée.

**L'intention.** C'est la pièce qui manquait pour monétiser l'extension. On a déjà les
comptes (Supabase auth). Si l'élève a souscrit dans notre base, se connecter à son compte
débloque le **mode mentorat**.

**Ce que ça débloque : le plan d'évolution** (le prompt 4, discuté le 17/07). L'IA propose
une grille — où en est l'élève sur les cinq axes d'évaluation ETM, ce qui indiquerait le
passage au palier suivant — à partir de tout l'historique de la conversation.

**Pourquoi ça referme un vrai problème.** On avait identifié le danger d'une IA qui
décrète « tu as atteint le niveau 3 » : elle fabriquerait une autorité qu'elle n'a pas,
alors que chez nous le plan est posé par un mentor humain. Le mode mentorat **est** la
réponse : l'IA propose, **Brice valide**. C'est exactement ce qu'on vend.

**Le deuxième volet, indissociable :** développer un moyen pour que Brice **surveille ce
qui se fait en mode mentorat**. Sans ça il n'y a pas de mentorat, juste une IA en roue
libre.

**Hypothèse de prix (Brice) :** ~5-6 €/mois si payé à l'année, ~9 € en mensuel.

#### Décidé par Brice (17/07/2026)

- **Prix** : 5,99 €/mois ou 8,99 €/mois. Juste l'accès au bouton mode mentorat. Prix
  d'idée de produit, peut monter. **Petit prix volontaire** : ne pas donner l'impression
  d'un truc « ultra quali ».
- **Ça ne donne AUCUN accès au temps personnel de Brice.** L'ETM reste à 4000 €/trimestre,
  et c'est ça qui est « avec lui ». Ne jamais brouiller les deux.
- **Stripe** + une page dédiée sur le site.
- **Contrôle d'accès par le backend** : on appelle la base pour savoir s'il a l'option.
  L'extension ne décide jamais.
- **Pas de surveillance active.** Le besoin réel est du SUPPORT : pouvoir jeter un oeil
  quand un élève ne comprend pas. → **Le partage d'écran suffit** et évite tout le
  problème de consentement. Ne PAS construire un système de surveillance.
- **Le carnet n'est pas amputé** : tout l'existant reste gratuit et continue d'évoluer.
  Le mode mentorat est une surcouche (suivi de progression + plan d'action).
- **Contenu** : une doctrine d'enseignement « Elite Trader Mentorship », à créer pour
  l'occasion (distincte de la doctrine générale déjà livrée).

#### ⚠️ Le problème dur : la résiliation

**On ne peut pas dé-injecter ce qui a été injecté.** Une fois le document dans la
conversation de l'élève, il est à lui : copiable, conservable à vie. Aucune mesure
technique ne le récupère.

Conséquence directe sur l'architecture : **aujourd'hui tout est côté client** (l'extension
pousse un prompt + un fichier dans l'IA de l'élève). Si le mode mentorat n'est QUE ça, il
est **incontrôlable** : on s'abonne un mois, on copie, on résilie, on continue à vie.

**On ne monétise pas un prompt, on monétise un service.** Ce qui reste contrôlable est ce
qui passe par le backend :
- la GÉNÉRATION du plan (vérification d'accès en direct à chaque fois),
- le SUIVI de la progression dans le temps, stocké chez nous,
- la FRAÎCHEUR de la doctrine (le résilié garde une photo qui vieillit).

Un résilié garde donc une vieille copie figée, et perd les nouveaux plans, le suivi et la
doctrine à jour. Ce modèle-là tient — **à condition que la valeur soit dans le plan
récurrent, pas dans le document**.

**Risque stratégique à trancher** : plus la doctrine ETM sera bonne, plus le problème
mord. Distiller ce qui se vend 4000 €/trimestre dans un fichier copiable à 5,99 €/mois est
une décision de business, pas de technique. Piste : que la doctrine mentorat reste le
CADRE, et que la valeur soit le PLAN généré pour cet élève à partir de SON historique —
ça, ça ne se copie pas, ça n'existe pas sans lui.

#### Forme : un panel, pas un 4e prompt

Instinct de Brice, et il est juste. Un 4e prompt dans une liste **a l'air gratuit**, se
copie en trois secondes, et rien ne le distingue des autres. Un mode qui ouvre son propre
espace (options de pilotage, prompts préparés) a une identité et justifie qu'on paye.
C'est aussi plus juste fonctionnellement : un plan n'est pas un one-shot — c'est le créer,
le mettre à jour, constater un palier.

#### L'architecture commerciale — précisée par Brice (17/07)

**Ne pas se tromper de modèle. L'extension et le journal partagent LA MÊME base Supabase.**
L'extension alimente la base ; le métier du journal (SaaS payant, trading journal) est de
prendre ces données et de les **travailler**. Le journal n'est donc pas propriétaire des
données : c'en est un consommateur, parmi d'autres.

**Conséquence : le mentorat ne dépend PAS du journal.** Il lit la même base, directement.
- Le mode mentorat est une **option de l'extension**. Point.
- Le journal est un **SaaS séparé**.
- **Les deux sont indépendants** : on peut prendre l'un sans l'autre, ou les deux. Certains
  ne voudront que le mentorat, et c'est très bien.
- ❌ Ne PAS en faire un palier du journal (erreur d'analyse de Claude, corrigée par Brice).

**La friction de facturation est assumée, et c'est délibéré.** Il y aura plein de petits
modules et d'autres apps à venir. Un gros bundle qui comprendrait le tout (pourquoi pas
jusqu'à l'accès au Live Club) viendra **plus tard**. Aujourd'hui ce n'est pas le sujet :
ne pas sur-concevoir la facturation maintenant.

#### Ce qui rend l'extension nécessaire (le vrai « moat »)

Conclusion de la discussion Brice/Claude du 17/07. **Ne PAS brider le prompt** : un prompt
bridé fait un moins bon produit, se contourne en deux minutes, et l'élève sent la laisse.

**Le prompt est la recette, l'extension a les ingrédients.** La recette peut être publique.
Elle ne vaut rien sans les données, et les données sont chez nous :
- les jugements A/B/C **avec leur cause** (technique / connaissance / émotionnel),
- le champ « erreur » des cooldowns → *combien de fois il répète la même erreur*,
- les jauges d'émotion des warmups, les DOL, les résultats de trades,
- **le nombre de fois qu'un concept a été journalé** — la même donnée nourrit deux choses :
  le compteur affiché dans le journal (priorité 5 du backlog) et l'agrégation du mentorat.
  Attention : ce n'est PAS une dépendance — le mentorat calcule depuis la base, il n'attend
  pas que la feature du journal soit livrée. Simplement, la donnée compte plus qu'on ne le
  croyait quand la priorité 5 a été rangée en bas de pile.

Exemple de ce qu'un prompt copié ne produira jamais : « sur tes 40 derniers trades : 12
notés C, dont 9 de cause émotionnelle, et 8 de ces 9 après une séance où ta jauge de
warmup dépassait 60. »

**Deux arguments, pas un seul :**

1. **La friction (Brice).** L'humain va au moindre effort. Même avec les documents sous la
   main, s'il peut cliquer un bouton, il cliquera. Personne n'exporte religieusement 40
   sessions pour économiser 5,99 €. Corollaire : ce moat se **maintient**, il ne se
   construit pas une fois. Les prompts doivent rester excellents, sinon l'argument tombe.
2. **Le plafond dur (Claude).** Même en voulant tricher, on ne colle pas 40 séances dans
   une conversation : le contexte explose. La seule façon de raisonner sur six mois, c'est
   un brief **compressé** de quinze lignes. Ce n'est pas du confort, c'est la seule chose
   qui marche à l'horizon d'un mentorat. **Le produit se renforce avec l'ancienneté de
   l'élève** au lieu de se dévaluer.

**La règle qui en découle :** le résilié garde la méthode, une photo figée et son
historique passé. Il perd le brief chiffré à jour, le plan qui évolue, la validation des
paliers et la continuité entre conversations. **On ne lui retire rien, on arrête d'ajouter.**

#### Les questions encore ouvertes — mises à jour le 28/08/2026

1. ~~**Le rail technique**~~ **TRANCHÉ par Brice le 28/08 : NOTRE IA.** Le brief
   compressé / plan d'évolution est fabriqué par notre IA (jetons Anthropic, appels côté
   backend — même rail que la future capture IA). Acquis du 17/07 qui ne bougent pas :
   l'élève converse avec SON agent IA, le prompt copiable n'est pas un problème (la
   valeur est dans les données), et son IA ne « pioche » jamais directement dans notre
   base — c'est l'EXTENSION qui récupère auprès du backend et joint à la conversation.
   Les deux moteurs coexistent : notre IA FABRIQUE (backend, contrôlable, validable par
   Brice), son IA CONSOMME (conversation). À prévoir avec : écran cockpit de monitorage
   jetons/coûts par membre + support IA transversal (voir
   `D:\6_Societe\Pilotage\Data-Performance\COCKPIT-ROADMAP.md`, section du 28/08).
2. ~~**Où vit le plan et le suivi ?**~~ **TRANCHÉ par Brice le 28/08** : le plan s'affiche
   dans un **panel dédié de l'extension** (données stockées chez nous). Mentorat seul
   n'ouvre PAS le journal — les deux produits restent indépendants, l'extension est le
   pont naturel vers le journal. Affichage AUSSI dans le journal seulement si l'élève a
   les deux (futur pack premium — cohérent avec « le bundle viendra plus tard »).
3. **Que contient exactement la doctrine ETM** — PRÉCISÉE par Brice le 28/08 : la réponse
   dépend de l'USAGE. Définir d'abord comment les élèves mentorat interagissent avec le
   suivi (recevoir le plan, le questionner, débriefer contre lui, passages de palier
   validés par Brice, questions-réponses), puis écrire la doctrine pour servir exactement
   ces interactions. Cf. le risque stratégique (ne pas cannibaliser l'ETM à 4000 €).
4. ~~Le mentorat est-il un palier du journal ?~~ **TRANCHÉ par Brice le 17/07 : NON.**
   Voir « L'architecture commerciale » ci-dessous.

> 📎 Traçabilité : la conversation d'origine (17/07, commits `3ad4b51`/`e01cc99`/`952d505`
> entre 12h03 et 12h28) n'existe pas dans les transcripts de la machine principale —
> ce TODO, écrit en direct pendant cette conversation, en est le seul enregistrement.

### ✅ 7. Remplacer les `alert()` restants par des notifications in-app — fait le 27/08/2026 (v1.6.12)

Même racine que le bug des `confirm()` : `alert()` est aussi supprimable par
« ne plus afficher ce type de boîte », rendant les messages **silencieux** pour
l'élève concerné. Fait : module `src/lib/toast.ts` (impératif, sans provider —
utilisable du sidepanel ET du fullscreen), les 22 `alert()` de 9 fichiers
remplacés par `toast.error/success/info` (erreurs affichées 7 s, cliquables
pour fermer).

Dans la même v1.6.12 : fix du bouton d'envoi de la capture bar qui se dérobait
au clic (retour élève Franky, Chrome) — le mousedown sur les boutons de la
barre blurait l'éditeur, la ligne d'aide clavier disparaissait et la barre
descendait sous le curseur avant le mouseup. `onMouseDown preventDefault` sur
la rangée de boutons de `CaptureInput.tsx`.

### ✅ 4. DOL — Draw on Liquidity — fait le 10/07/2026 (v1.6.2)

- Nouveau composant `DolBar` épinglé (sticky) en haut de la note : on pose un
  ou plusieurs niveaux (biais haussier/baissier, instrument, prix, commentaire)
  pendant l'analyse HTF ; ils restent visibles pendant toute la séance.
- Statut par niveau : actif → atteint → invalidé (cycle au clic).
- `note.dols[]` (type `DolLevel`) ; sync vers le journal (`Note.dols` JSONB,
  migration `2026-07-10-dols.sql` appliquée) ; présent dans les exports
  PDF/DOCX/Drive (en tête de document).
- [ ] Reste : valider l'UX en réel dans Brave.

### ✅ 1. Bug content script ESM — corrigé le 10/07/2026

Diagnostic Codex confirmé : le content script buildé commençait par un import
ESM alors que Chrome/Brave l'injecte en script classique.

Correctif appliqué (option propre de Codex) :
- Le content script n'importe plus `storage` (l'`await import(...)` est
  supprimé) — il ne fait plus que de l'extraction DOM et du messaging. En
  bonus, ça corrige un second bug latent : Dexie dans un content script
  ouvrait l'IndexedDB de l'ORIGINE DE LA PAGE (notes éparpillées par site),
  pas celle de l'extension.
- Les 3 flux de capture du service worker (page, sélection, screenshot) qui
  déléguaient la sauvegarde au content script (`tabs.sendMessage SAVE_NOTE`)
  sauvegardent maintenant directement via `storage.saveNote()` dans le SW
  (même origine que le sidepanel → même IndexedDB).
- Le SW gère aussi le message `SAVE_NOTE` (sélection de zone du content script).
- `manifest.json` : `"background.type": "module"` (le SW peut charger ses
  chunks ES — supporté Chrome/Brave MV3).
- Vérifié après build : `dist/content/content-script.js` sans aucun `import`
  ni référence `chunks/`.
- [ ] Reste : recharger l'extension dans Brave et vérifier que l'erreur de
      `brave://extensions` a disparu + tester une capture de page (menu
      contextuel) et une sélection de zone (Ctrl+Shift+glisser).

### ✅ 2. Warmup à la demande, multi-séances — fait le 10/07/2026

- Nouveau modèle : `note.warmups[]` (chaque entrée a `id` + `startedAt`) ;
  `note.warmup` legacy toujours lu/éditable (affiché en haut si rempli),
  plus alimenté.
- Le bouton « Lancer mon warmup » (haut de note) crée une entrée ancrée à
  l'instant du clic : la carte apparaît DANS le fil, à sa position
  chronologique (comme un segment de trade), dépliée, avec l'heure de
  lancement dans l'en-tête.
- Plusieurs lancements = plusieurs cartes = plusieurs séances dans la même
  note.
- ✅ Sync journal (10/07/2026) : les warmups remontent via `/api/notes`
      (colonne `Note.warmups` JSONB créée et migration appliquée en base) ;
      le pull les restaure. Les cooldowns remontaient déjà (dans `trades`).
- ✅ Exports (10/07/2026) : PDF/DOCX/Drive reconstruisent le fil complet
      (module `export-flow.ts`) — marqueurs Trade 1/2/3 avec heure + résultat,
      jugement A/B/C, cooldown, warmups à leur position chronologique.
- ✅ Version 1.6.1 (package.json + manifest).
- [ ] Reste : valider l'UX en réel (Brave) puis générer le zip v1.6.1.

### 4. Fonctionnalité DOL — Draw on Liquidity

**Problème à résoudre :** pendant l'analyse HTF (avant la séance), on identifie la
direction et le niveau qui attire le prix. Une fois en séance, absorbé par les
petites unités de temps, on perd cette vision HTF — ou du moins la direction
qu'on s'était fixée.

**Rappel du concept (ICT / Smart Money) :** le DOL est le niveau ou la zone de
liquidité vers lequel le prix est « aspiré » — anciens highs/lows, equal
highs/lows, FVG. Buy-side liquidity au-dessus du prix, sell-side liquidity en
dessous. Définir le DOL avant le trade donne une cible logique et un biais
directionnel à ne pas perdre.

**Comportement voulu dans la note :**
- [ ] Définir un ou plusieurs niveaux DOL au moment de l'analyse HTF :
      prix + biais/direction + instrument + commentaire court.
- [ ] Le DOL reste visible en permanence pendant la séance (épinglé dans le
      header du sidepanel / en haut de la note) pour ne jamais perdre la
      direction HTF en étant plongé dans les LTF.
- [ ] Statut d'un niveau : actif / atteint / invalidé.
- [ ] (à discuter) Sync vers le journal, comme les tags et concepts.

---
**Dernière mise à jour :** 27 août 2026

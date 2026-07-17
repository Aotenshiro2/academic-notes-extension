# TODO — Le Carnet du Trader (extension)

## Priorités (ordre validé par Brice le 10 juillet 2026)

0. **Pont Edgyx** — dossier d'analyse envoyé à Geoffrey (voir
   `docs/edgyx-bridge/`), en attente de son retour de besoins. L'implémentation
   suivra les allers-retours.
1. ~~🐛 Bug content-script~~ ✅ **corrigé le 10/07/2026**
2. ~~Warmup à la demande, multi-séances~~ ✅ **fait le 10/07/2026**
3. *(côté journal : homogénéisation du shell UI — voir TODO du journal)* ← prochaine tâche
4. ~~Fonctionnalité DOL — Draw on Liquidity~~ ✅ **fait le 10/07/2026** (v1.6.2, voir plus bas)
5. *(côté journal : compteur de journalisation des concepts)* — ⚠️ pas cosmétique :
   c'est une **source de données du mode mentorat** (section 8).

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

#### Ce qui rend l'extension nécessaire (le vrai « moat »)

Conclusion de la discussion Brice/Claude du 17/07. **Ne PAS brider le prompt** : un prompt
bridé fait un moins bon produit, se contourne en deux minutes, et l'élève sent la laisse.

**Le prompt est la recette, l'extension a les ingrédients.** La recette peut être publique.
Elle ne vaut rien sans les données, et les données sont chez nous :
- les jugements A/B/C **avec leur cause** (technique / connaissance / émotionnel),
- le champ « erreur » des cooldowns → *combien de fois il répète la même erreur*,
- les jauges d'émotion des warmups, les DOL, les résultats de trades,
- **le nombre de fois qu'un concept a été journalé** → c'est la priorité 5 du backlog
  (compteur de concepts, côté journal). **Ce n'est donc pas un gadget : c'est une source
  de données du mentorat.** La matière est déjà en base, l'agrégation est constructible
  sans toucher au modèle.

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

#### Les questions encore ouvertes

1. **Le rail technique du plan** : généré côté backend (contrôlable, mais coûte des tokens
   à AOK) ou côté client (gratuit, mais incontrôlable) ? C'est la question qui décide de
   tout le reste.
2. **Où vit le plan et le suivi ?** Le journal semble l'endroit naturel : il a déjà la
   base, les notes, les annotations, et c'est là que vit la relecture.
3. **Que contient exactement la doctrine ETM** livrée à 5,99 € — cf. le risque stratégique.
4. **⚠️ Le journal sera un SaaS payant** (info Brice, 17/07). Or le mentorat s'appuie sur
   les données du journal → **il faut donc le journal pour l'avoir**, et le prix réel
   devient *journal + 5,99 €*, pas 5,99 €. Donc : le mentorat est-il un add-on du journal,
   une option de l'extension, ou un **palier supérieur du journal** ? Deux lignes de
   facturation à 5,99 € coûtent plus de friction qu'elles ne rapportent. Instinct Claude :
   un palier du journal. À trancher par Brice, qui seul a le modèle du journal en tête.

### 7. (à planifier) Remplacer les `alert()` restants par des notifications in-app

Même racine que le bug des `confirm()` : `alert()` est aussi supprimable par
« ne plus afficher ce type de boîte ». Les `alert()` restants (`src/sidepanel/App.tsx`,
erreurs d'export/capture/import) deviendraient alors **silencieux** pour l'élève
concerné. Moins grave (message perdu, pas d'action bloquée) mais à traiter :
demande un petit système de toasts.

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
**Dernière mise à jour :** 10 juillet 2026

import React, { useState, useEffect } from 'react'
import {
  Keyboard,
  BookOpen,
  Lightbulb,
  Clock,
  Shield,
  ArrowLeft,
  Command,
  Map,
} from 'lucide-react'
import ThemeToggle from '@/components/ThemeToggle'

const version = chrome.runtime.getManifest().version

const SHORTCUTS = [
  { keys: ['Ctrl', 'Shift', 'A'], mac: ['Cmd', 'Shift', 'A'], desc: 'Ouvrir / fermer le panneau latéral' },
  { keys: ['Alt', 'Shift', 'C'], mac: ['Opt', 'Shift', 'C'], desc: 'Capture rapide de la page courante' },
  { keys: ['Ctrl', 'B'], mac: ['Cmd', 'B'], desc: 'Mettre en gras' },
  { keys: ['Ctrl', 'I'], mac: ['Cmd', 'I'], desc: 'Mettre en italique' },
  { keys: ['Ctrl', 'U'], mac: ['Cmd', 'U'], desc: 'Souligner' },
  { keys: ['Ctrl', 'Shift', 'S'], mac: ['Cmd', 'Shift', 'S'], desc: 'Capture d\'\u00e9cran' },
  { keys: ['Ctrl', 'Shift', 'I'], mac: ['Cmd', 'Shift', 'I'], desc: 'Ins\u00e9rer une image' },
  { keys: ['Entr\u00e9e'], mac: ['Entr\u00e9e'], desc: 'Envoyer le message' },
  { keys: ['Shift', 'Entr\u00e9e'], mac: ['Shift', 'Entr\u00e9e'], desc: 'Nouvelle ligne' },
  { keys: ['\u00c9chap'], mac: ['\u00c9chap'], desc: 'Fermer un dialog' },
]

const WORKFLOWS = [
  {
    title: 'Capturer une note',
    steps: [
      'Ouvrez le panneau avec Ctrl+Shift+A',
      'Tapez votre texte dans l\'éditeur en bas',
      'Ajoutez un screenshot si besoin (icône appareil photo)',
      'Appuyez sur Entrée pour enregistrer',
    ],
  },
  {
    title: 'Mode plein écran',
    steps: [
      'Cliquez sur l\'icône d\'agrandissement dans l\'en-tête',
      'Naviguez entre vos notes dans la sidebar gauche',
      'Éditez le titre, ajoutez des messages, exportez en PDF',
    ],
  },
  {
    title: 'Analyse IA',
    steps: [
      'Ouvrez une note puis cliquez sur l\'icône Sparkles (violet)',
      'Choisissez un type d\'analyse (neutre, mentor, action, libre)',
      'Sélectionnez le provider (ChatGPT, Claude, Gemini, Perplexity, Grok)',
      'Le contexte est envoyé automatiquement — le prompt est aussi copié en backup',
    ],
  },
]

const TIPS = [
  'Titrez chaque note clairement pour la retrouver facilement dans l\'historique.',
  'Utilisez les tags pour organiser vos notes par thème ou par session.',
  'Capturez d\'abord, analysez ensuite — ne perdez pas le momentum.',
  'Exportez en PDF pour archiver une version figée de vos notes.',
  'L\'analyse IA copie toujours le prompt dans le presse-papier en backup.',
]

const CHANGELOG = [
  {
    version: '1.8.4',
    title: 'Tu choisis ce que le mentor a le droit de lire',
    items: [
      'Nouveau : au premier passage dans le mode mentorat, on te demande quels dossiers il peut regarder. Ton carnet ne sert probablement pas qu’au trading, et le mentor n’a pas à lire tes notes perso pour parler de tes trades.',
      'Si tu ne coches rien, il lit tout : c’est le cas par défaut, tu n’as aucun geste à faire. Cocher un dossier prend aussi ses sous-dossiers.',
      'Le cadrage vaut pour tout ce qu’il voit — le brief chiffré, les jugements A/B/C, ton retard de relecture et le plan d’évolution. Il ne te reprochera pas un retard sur des notes que tu lui as demandé d’ignorer.',
      'L’icône d’arborescence en haut à droite de l’écran mentorat rouvre le choix quand tu veux.',
      'L’écran mentorat perd son violet : il chargeait la lecture. Le signal « ça part vers l’IA » reste porté par l’anneau du bouton « Demander au mentor ».',
    ],
  },
  {
    version: '1.8.3',
    title: 'Coller une capture entre deux blocs',
    items: [
      'Correction : entre deux blocs, le ＋ acceptait le texte mais perdait les images. Une capture collée seule ne restait ni dans la note ni dans le journal, et quand elle passait, elle s’affichait en double et alourdissait la note pour rien. Elle s’enregistre maintenant comme une vraie image.',
      'Le champ d’insertion accepte le mélange : écris ta légende, colle ta capture, l’ordre est conservé.',
      'La carte Carnet Premium du mode mentorat avait gardé l’ancienne présentation et son propre bouton de paiement : elle ignorait l’offre annuelle et n’ouvrait pas le paiement avec ton email. Elle reprend la présentation de « Mon forfait » et t’y envoie.',
    ],
  },
  {
    version: '1.8.2',
    title: 'L\u2019\u00e9cran de forfait dit enfin la v\u00e9rit\u00e9',
    items: [
      '\u00ab Mon forfait \u00bb annon\u00e7ait encore le mode mentorat comme \u00ab bient\u00f4t \u00bb et \u00ab une option payante en pr\u00e9paration \u00bb. C\u2019\u00e9tait vrai fin ao\u00fbt ; \u00e7a ne l\u2019est plus. Le mentorat est l\u00e0, Carnet Premium existe, et l\u2019\u00e9cran te permet maintenant de le prendre.',
      'Ce n\u2019est pas un tableau comparatif : une offre, un prix, un bouton. La question n\u2019est pas de savoir lequel tu prends, mais si tu passes.',
      'L\u2019\u00e9cran s\u2019adapte \u00e0 ton acc\u00e8s. Si ton adh\u00e9sion Ao Knowledge ouvre d\u00e9j\u00e0 tout, on ne te vend rien : on te le dit. Si tu es d\u00e9j\u00e0 abonn\u00e9, on te remercie et on te dit o\u00f9 g\u00e9rer.',
      'Ton email est pr\u00e9-rempli sur la page de paiement. Ce n\u2019est pas du confort : ton acc\u00e8s s\u2019ouvre sur l\u2019adresse du paiement, et payer avec une autre te laissait abonn\u00e9 mais bloqu\u00e9.',
    ],
  },
  {
    version: '1.8.1',
    title: 'Le mentorat devient une vraie conversation',
    items: [
      'L’écran du mentorat donnait l’impression qu’on pouvait lui répondre. C’est maintenant le cas : tu écris, il répond.',
      'Le fil vit dans une note épinglée, « Mentorat AOK », qui reste en tête de ton historique. Ce n’est pas un chat à part : c’est une note comme les autres, qui se synchronise, s’exporte et se relit.',
      'Deux boutons, et la différence compte. « Écrire » pose ton texte dans la note sans rien envoyer, c’est gratuit et instantané : tu peux prendre des notes dans ce fil, revenir demain, réfléchir. « Demander au mentor » est le seul moment où quelque chose part.',
      'Quand tu demandes, le mentor reçoit tout ce que tu as écrit depuis sa dernière réponse, pas seulement ta dernière ligne. Tu peux poser ta pensée en trois fois et ne demander qu’une seule fois.',
      'Il répond à partir de ton brief chiffré : tes trades, tes jugements A/B/C, tes causes d’erreur, tes relectures en retard. Il ne juge jamais une décision à son résultat et il n’invente aucun chiffre.',
    ],
  },
  {
    version: '1.8.0',
    title: 'La capture intelligente devient vraiment intelligente',
    items: [
      'La capture trie enfin. Un secrétaire lit la page à ta place, garde ce qu\'elle dit vraiment et jette le reste : menus, vidéos recommandées, pseudos des commentateurs, encarts d\'abonnement. Quand quelque chose n\'a pas pu être lu, il te le dit au lieu de combler le trou.',
      'La capture d\'écran est enfin lue. Sur un graphique TradingView, la page ne contient que des métadonnées : tes niveaux, tes zones et tes outils de position sont sur l\'image. Ils sont maintenant pris en compte.',
      'Nouveau : « Étudier la note », le deuxième temps. Quand tu veux, sur le moment ou deux semaines plus tard à la relecture, la note est relue dans le cadre de la méthode et la lecture s\'écrit dans la note. Réservé au Carnet Premium.',
      'Nouveau : SimpleFX est reconnu. Le compte, l\'instrument, les onglets de positions et le tableau des positions clôturées sont lus tels quels, sans recalcul, et le nombre de lignes non visibles est signalé.',
      'Correction : sur YouTube, la description de la vidéo était perdue et le titre répété trois fois. La description est maintenant lue en entier, avec les chapitres et la durée.',
      'Correction : sur TradingView, « Prix : — » restait vide et les points clés se résumaient à l\'heure du graphique et à l\'heure de ton ordinateur. Le prix et l\'OHLC sont lus dans la légende, les horloges retournent dans les métadonnées.',
      'Si l\'IA n\'est pas disponible — hors ligne, quota atteint — la capture continue de fonctionner comme avant. Tu ne tombes jamais en panne.',
      'La capture intelligente est reconnaissable dans le menu + : un liseré arc-en-ciel l\'entoure quand elle passe par l\'IA. Sans droit ou sans quota, elle reste ce qu\'elle a toujours été et fonctionne comme avant.',
      'Nouveau : « Approfondir cette note », juste sous le résumé. La capture te donne la matière, ce bouton la relit dans le cadre de la méthode et écrit la lecture dans la note. Tu peux le faire tout de suite ou deux semaines plus tard à la relecture, là où ça vaut le plus.',
      'Le bouton de warmup a quitté la barre du haut : « Lancer un warmup » est déjà au-dessus de la zone de saisie, là où tu t\'en sers.',
      'Nouveau : dans « Configurer son IA », tu choisis le modèle qui fait l\'étude. Ceux que ton forfait ne couvre pas restent visibles avec un cadenas, et en face de chacun tu vois combien d\'études il te reste. Tu peux descendre en gamme quand tu veux : c\'est un peu moins fin, et ça multiplie le nombre d\'études qui tiennent dans ton quota.',
      'Nouveau : le compte connecté s\'affiche en tête du menu des paramètres. Tu vois d\'un coup d\'œil avec quel email tu travailles, et « Visiteur » si tu n\'es pas connecté. Au retour de l\'écran Compte, l\'affichage se met à jour tout de suite au lieu d\'attendre la réouverture du panneau.',
    ],
  },
  {
    version: '1.7.1',
    title: 'Trois finitions',
    items: [
      'Correction : un fantôme de la zone du bas pouvait rester affiché par-dessus le texte pendant le survol des blocs. Réglé.',
      'Correction : plus d\'espace vide avant les tags d\'un bloc — l\'horodatage apparaît désormais en surimpression au survol, comme partout ailleurs.',
      'Nouveau : « Retirer la note » dans la fenêtre de notation — tu peux enlever un jugement A/B/C posé par erreur, le trade redevient non noté (dans l\'extension et le journal).',
    ],
  },
  {
    version: '1.7.0',
    title: 'Dicte tes notes',
    items: [
      'Nouveau : la dictée vocale — un bouton micro dans la barre de capture. Clique, parle, re-clique : ta dictée devient du texte. Propulsé par Whisper, 100 % local : ta voix ne quitte jamais ta machine.',
      'Au premier usage, le modèle de reconnaissance (~170 Mo) se télécharge une fois puis reste en cache — les dictées suivantes fonctionnent même hors ligne.',
      'Rangement : « Poser un DOL » et « Lancer un warmup » sont désormais dockés au-dessus de la barre d\'envoi au lieu de flotter dans la note, les longs textes collés s\'affichent en vignette compacte, et l\'espace sous le titre a été resserré.',
      'Nouveau : le support intégré — un bouton bouée dans le pied du panneau ouvre un chat avec l\'assistant AOK, et « Parler à un humain » envoie ta question par email avec la transcription.',
      'Mode mentorat : le panel affiche ton brief chiffré et peut générer une proposition de plan d\'évolution — chaque proposition est validée par un mentor humain avant de compter.',
    ],
  },
  {
    version: '1.6.12',
    title: 'Des boutons qui ne bougent plus, des messages qui restent visibles',
    items: [
      'Correction : le bouton d\'envoi de la barre de capture pouvait se décaler au moment exact du clic (la ligne d\'aide clavier disparaissait sous la barre) — le clic tombait à côté. Il ne bouge plus.',
      'Amélioration : les messages d\'erreur et de confirmation (exports, imports, connexion au journal…) s\'affichent désormais dans l\'application au lieu des boîtes de dialogue du navigateur, que Chrome pouvait rendre définitivement silencieuses via « ne plus afficher ».',
      'Lecture plus dense : les blocs sans tag ne réservent plus une ligne vide sous chaque message — la date, « + tag » et la corbeille apparaissent en surimpression au survol. Le texte se lit comme un document, plus comme un chat.',
      'Nouveau : insérer du texte entre deux blocs — survole l\'espace entre deux blocs, un ＋ apparaît, clique et écris. Idéal pour annoter un screenshot après coup pendant la relecture.',
      'Nouveau : les sous-dossiers — survole un dossier dans l\'historique et clique l\'icône dossier+ pour créer un dossier dedans (un niveau de profondeur). Le glisser-déposer de notes fonctionne aussi sur les sous-dossiers, et l\'arborescence suit dans le Journal d\'Études.',
    ],
  },
  {
    version: '1.6.9 → 1.6.11',
    title: 'Solidité (le travail d’août)',
    items: [
      'L’application ne part plus en page blanche quand un écran plante : l’erreur est affichée proprement et le reste du carnet continue de fonctionner.',
      'La santé du stockage local est surveillée, et les images des notes sont gérées à part au lieu d’être recopiées avec le texte.',
      'Le service worker et la synchronisation ont été durcis : moins de notes qui restent en attente sans raison.',
      'Amélioration : les blocs de texte riche collés depuis une page web gardent leur mise en forme au lieu d’arriver à plat.',
      'Correction : les infos d’un warmup ne se perdent plus en passant d’un champ à l’autre.',
    ],
  },
  {
    version: '1.6.8',
    title: 'Une lecture plus calme',
    items: [
      'Amélioration : les pastilles « + tag » n\'encombrent plus la lecture — elles n\'apparaissent qu\'au survol du bloc (ou de la ligne de titre pour les tags de note). Les tags déjà posés restent visibles.',
      'Changement : l\'affichage des métadonnées de capture se règle désormais dans les Paramètres (section Capture automatique), désactivé par défaut.',
      'Journal d\'Études : une note fraîchement synchronisée apparaît sans recharger la page, et le glisser-déposer d\'une note de l\'extension vers le canvas fonctionne même juste après la sync.',
    ],
  },
  {
    version: '1.6.7',
    title: 'Le bruit disparaît, la sync devient fiable',
    items: [
      'Nouveau : les métadonnées de capture (date, page, URL) ne sont plus des blocs de texte au milieu de tes notes — elles deviennent une ligne discrète, masquable d\'un clic (bouton « Métadonnées » au-dessus de la note ; le même œil existe dans le Journal d\'Études, où elles sont masquées par défaut).',
      'Amélioration : un screenshot pris avec une note ouverte part directement dans la note — la zone de saisie reste propre au lieu de se remplir d\'image et de métadonnées.',
      'Correction : supprimer une image (ou un long texte replié) affiche à nouveau la confirmation — le clic sur la poubelle ne restait plus sans effet.',
      'Synchronisation : les notes en attente partent automatiquement à l\'ouverture du panneau — plus besoin de cliquer « Envoyer les nouvelles » à la main.',
      'Synchronisation : une image déjà envoyée n\'est plus jamais re-téléversée — « Tout renvoyer » et les re-syncs deviennent beaucoup plus rapides.',
      'Nettoyage : les blocs de texte vides ne partent plus vers le journal (et ceux qui s\'y étaient accumulés ont été purgés).',
    ],
  },
  {
    version: '1.6.6',
    title: 'L\'avis Ao Knowledge affiné',
    items: [
      'Amélioration : le prompt « L\'avis Ao Knowledge » distingue clairement ta note de la doctrine, parle avec notre voix sans jamais citer le document, et annonce la suite dès le lancement de la conversation.',
    ],
  },
  {
    version: '1.6.5',
    title: 'Les prompts IA deviennent une vraie méthode',
    items: [
      'Nouveau : les prompts d\'analyse s\'enchaînent au lieu de se ressembler. « 1. Lancer la conversation » cadre ton IA et fait un premier état des lieux ; « 2. Débriefer une séance » sert au quotidien (évolutions, angles morts, une priorité) ; « 3. L\'avis Ao Knowledge » te donne ce que l\'académie en penserait — pas l\'avis générique de l\'IA.',
      'Le prompt « avis Ao Knowledge » joint automatiquement notre doctrine à ta conversation : ton IA répond avec notre méthode et notre vocabulaire, quelle que soit l\'IA que tu utilises.',
      'Amélioration : dans l\'historique, la liste des dossiers se replie (l\'état est mémorisé) et les tags n\'affichent que les plus utilisés, avec une pastille pour déplier les autres. De quoi tenir dans le temps sans que ça déborde.',
    ],
  },
  {
    version: '1.6.4',
    title: 'Correctifs remontés par les élèves',
    items: [
      'Correction : sélectionner du texte n\'ouvre plus le sélecteur de tags tout seul. La sélection reste intacte — souligner (Ctrl+U), copier/coller et le clic droit refonctionnent. Un petit bouton « Taguer » apparaît si tu veux taguer le passage.',
      'Correction : les confirmations de suppression sont maintenant des fenêtres de l\'extension. Si tu avais coché « ne plus afficher ce type de boîte » dans ton navigateur, supprimer une image ou une note redevient possible.',
      'Correction : dans l\'image en plein écran, le zoom ne bloque plus vers 125% — il va jusqu\'à 300% et l\'image défile pour se déplacer dedans.',
      'Correction : l\'envoi du PDF vers l\'IA choisit désormais le bon champ d\'import (l\'erreur « le fichier doit être GIF, WebP, PNG ou JPEG » ne devrait plus apparaître).',
    ],
  },
  {
    version: '1.6.3',
    title: 'Export Drive sécurisé (sans secret embarqué)',
    items: [
      'Sécurité : l\'export Google Drive ne contient plus aucun secret dans l\'extension. L\'authentification passe par launchWebAuthFlow (compatible Chrome, Brave, Opera, Edge) et l\'échange de jeton se fait côté serveur.',
      'Aucun changement visible : l\'export Drive fonctionne comme avant, sur tous les navigateurs.',
    ],
  },
  {
    version: '1.6.2',
    title: 'DOL, warmups multi-séances et exports complets',
    items: [
      'Nouveau : DOL — Draw on Liquidity. Pose ton niveau de liquidité cible (biais, instrument, prix, commentaire) pendant l\'analyse HTF ; il reste épinglé en haut de la note pendant toute la séance pour ne jamais perdre ta direction. Statut actif / atteint / invalidé en un clic.',
      'Amélioration : warmup à la demande et multi-séances — lance-en autant que tu veux dans une même note ; chacun s\'ancre dans le fil au moment où tu le lances.',
      'Amélioration : le bouton warmup (☀ en haut) crée une note de séance à la volée si tu es sur l\'accueil — plus besoin d\'ouvrir une note d\'abord.',
      'Amélioration : les exports PDF/Word/Drive contiennent désormais TOUT — trades (Trade 1/2/3 avec heure et résultat), jugements A/B/C, cooldowns, warmups et DOL.',
      'Synchronisation : warmups et DOL remontent maintenant dans le Journal d\'Études.',
      'Correction : le content script ne provoque plus d\'erreur au chargement (Brave/Chrome).',
      'Correction : les infos d\'un warmup ne se perdent plus entre deux champs.',
    ],
  },
  {
    version: '1.6.0',
    title: 'Rituel de séance + pont vers le journal',
    items: [
      'Nouveau : Warmup de séance — lance-le directement depuis ta note quand tu es prêt à trader (état physique/émotionnel, pensée dominante, objectif du jour, jauge d\'émotion). Jamais imposé : une note de cours l\'ignore.',
      'Nouveau : Cooldown par trade — après chaque trade fermé, un débrief court (émotion, erreur, leçon) à côté de sa note A/B/C.',
      'Nouveau : glisse une note de l\'historique directement sur le canvas du Journal d\'Études.',
      'Amélioration : indicateur permanent d\'état de synchronisation dans le pied de page.',
      'Correction : identité stable en développement + synchronisation des dossiers.',
      'Correction : « Ouvrir le journal » pointe désormais vers journal.aoknowledge.com.',
    ],
  },
  {
    version: '1.5.0',
    title: 'Le Carnet du Trader — notation A/B/C, trades et tri',
    items: [
      'Nouveau nom : l\'extension devient « Le Carnet du Trader »',
      'Notation : badge A/B/C à côté du titre — jugez votre vision (A = je reprendrais sans hésiter, B = flou, C = forcé) avec une phrase de justification, relecture programmée à 14 jours',
      'Trades : bouton ⌖ « je prends un trade » — chaque trade devient un segment dans le fil (screenshots et notes rattachés), clôture Gain/Perte/BE, et SA propre notation',
      'Sur une perte : catégorisez la cause du stop loss (technique / connaissance / émotionnel)',
      'Tags unifiés : le même picker que le journal partout (note + messages), groupé par catégorie',
      'File « À trier » : dans l\'historique, retrouvez d\'un clic les notes sans tag ni notation + filtre par tags les plus utilisés',
      'Concepts éditables : corrigez à la main ce que la capture intelligente extrait',
      'Capture externe : screenshot d\'une app hors navigateur (Zoom, plateforme de trading desktop)',
      'Images : compression compatible service worker, visionneuse plein écran depuis le sidepanel',
      'Sync : tags, concepts, trades et notations voyagent vers le Journal d\'Études ; upload d\'images fiabilisé via le proxy du journal',
    ],
  },
  {
    version: '1.4.12',
    title: 'Recherche, stabilité et palette du journal',
    items: [
      'Nouveau : barre de recherche dans l\'historique des notes (titre + tags)',
      'Nouveau : bouton « Reconstruire le journal » pour repartir d\'une sync propre',
      'Fix : crash du service worker (keepAlive + quota de stockage dépassé)',
      'Fix : la position de scroll est préservée à l\'ajout de messages ou lors d\'une mise à jour distante',
      'Style : palette claire/sombre alignée sur celle du Journal d\'Études',
    ],
  },
  {
    version: '1.4.8',
    title: 'Sync multi-fenêtres (5 écrans)',
    items: [
      'Fix : les sidepanels ouverts sur plusieurs écrans s\'ignoraient mutuellement (filtre source statique)',
      'Nouveau : toute sauvegarde dans une fenêtre se répercute automatiquement dans les autres',
      'Protection : si une édition est en cours lors d\'un refresh distant, un bandeau s\'affiche plutôt que d\'écraser le contenu',
    ],
  },
  {
    version: '1.4.7',
    title: 'Export Google Drive + Pull journal + Fix AnalyzeNoteDialog',
    items: [
      'Nouveau : export de notes en .docx directement vers Google Drive (OAuth PKCE)',
      'Nouveau : importer ses notes depuis le journal vers l\'extension (AccountView)',
      'Fix : le dropdown "Ajouter des notes" dans l\'analyse IA ne se fermait plus au clic',
      'Fix : le dropdown ne se réinitialisait plus tout seul après quelques secondes',
      'Sécurité : client secret Google Drive sorti du code source',
    ],
  },
  {
    version: '1.4.5',
    title: 'Sync : état réel complet + AccountView redesign',
    items: [
      'Fix : "Vérifier" retournait toujours 0 confirmées car il ne scannait que les notes avec syncedAt déjà set (bug structurel)',
      'Fix : le state React n\'était jamais rechargé après "Sync tout" — les stats restaient stale',
      'Nouveau : "Vérifier" détecte maintenant 6 états distincts par note',
      '✓ Confirmées : présentes dans l\'extension ET le journal',
      '○ En attente : jamais synquées, pas exclues',
      '✗ Manquantes du journal : étaient synquées mais ont disparu du journal',
      '⊗ Exclues manuellement : vous les avez exclues depuis l\'historique',
      '− Supprimées du journal : supprimées du journal, exclues automatiquement',
      '⚠ Seules dans le journal : supprimées de l\'extension mais encore dans le journal (si supprimées du journal aussi → perdues partout)',
      'Fix : "Vérifier" met à jour syncedAt localement pour les notes confirmées (réconciliation locale/journal)',
    ],
  },
  {
    version: '1.4.4',
    title: 'Flaguer des notes + stats sync locales',
    items: [
      'Nouveau : exclure une note de la sync directement depuis l\'historique (icône CloudOff au hover)',
      'Une note exclue manuellement n\'est plus envoyée au journal lors de "Sync tout"',
      'Vue Compte : stats locales instantanées (synquées / en attente / exclues) visibles sans appuyer sur "Vérifier"',
      'Fix : "Sync tout" et "Re-synquer" mettent désormais à jour syncedAt localement → "Vérifier" affiche les confirmées correctement',
      'Fix Supabase Storage : ajout de la politique RLS UPDATE — les uploads d\'images ne retournent plus HTTP 500',
    ],
  },
  {
    version: '1.4.3',
    title: 'Fix sync : erreurs HTTP 413 (images trop lourdes)',
    items: [
      'Fix : les notes avec des captures d\'écran ne causent plus d\'erreur "413 Request Too Large" lors de la sync',
      'Quand l\'upload d\'une image vers Supabase Storage échoue, l\'image est retirée du payload (au lieu de garder le base64 brut qui faisait exploser la taille)',
      'L\'image reste intacte dans l\'extension (IndexedDB est la source de vérité)',
    ],
  },
  {
    version: '1.4.2',
    title: 'Fix sync structurel — Smart Capture + modifications + traçabilité',
    items: [
      'Fix : les notes créées via Smart Capture avaient un contenu vide dans le journal (les messages étaient là mais le champ content ne l\'était pas)',
      'Fix : modifier une note déjà synquée propage maintenant la modification vers le journal automatiquement',
      'Nouveau : chaque note synquée inclut désormais sa date originale de création (capturedAt) et la version de l\'extension',
      'Journal : colonnes capturedAt + extensionVersion ajoutées à la base de données',
    ],
  },
  {
    version: '1.4.1',
    title: 'Vérification sync + gestion exclusion notes',
    items: [
      'Nouveau bouton "Vérifier" : compare les notes locales avec le journal et affiche combien sont confirmées, manquantes ou exclues',
      'Re-sync ciblée : les notes détectées comme manquantes peuvent être re-synquées en un clic',
      'Exclusion de sync : une note supprimée dans le journal est automatiquement marquée "exclue" dans l\'extension (ne sera plus re-synquée automatiquement)',
      'Sync tout : n\'envoie plus les notes marquées comme exclues',
      'Journal : endpoint DELETE /api/notes/:id (soft-delete) + contrainte unicité sourceUrl (évite les doublons)',
    ],
  },
  {
    version: '1.4.0',
    title: 'Auth email + inscription',
    items: [
      'Connexion par email et mot de passe en plus de Google OAuth',
      'Inscription : création de compte avec prénom, email, mot de passe et opt-in newsletter',
      'Réinitialisation de mot de passe : email de reset → page dédiée dans Journal d\'Études',
      'Journal d\'Études : page de connexion mise à jour avec onglets Connexion / Inscription',
      'Extension : vue Compte restructurée avec navigation Google / Email / Créer un compte',
    ],
  },
  {
    version: '1.3.5',
    title: 'Fix sync HTTP 413 — Supabase Storage',
    items: [
      'Fix : les notes avec screenshots ne d\u00e9clenchent plus d\u2019erreur HTTP 413 lors de la synchronisation',
      'Images upload\u00e9es dans Supabase Storage avant envoi (plus de base64 brut dans le payload)',
      'Compression automatique JPEG 1200\u00d7800 avant upload (qualit\u00e9 pr\u00e9serv\u00e9e, zoomable dans le journal)',
      'D\u00e9duplication par hash SHA-256 : la m\u00eame image n\u2019est jamais upload\u00e9e deux fois',
      'Fallback silencieux : si un upload \u00e9choue, la note est quand m\u00eame synqu\u00e9e',
    ],
  },
  {
    version: '1.3.4',
    title: 'Analyse multi-notes & PDF combiné',
    items: [
      'Analyse multi-notes : s\u00e9lectionnez plusieurs notes dans le dialog d\u2019analyse (ex: toute une semaine de trading)',
      'PDF combin\u00e9 : en mode multi avec images, un seul PDF fusionn\u00e9 est g\u00e9n\u00e9r\u00e9 (toutes les images incluses)',
      'Picker de notes : filtre par dossier, s\u00e9lection rapide d\u2019un dossier entier',
      'Fix doublon texte+PDF : quand un PDF est envoy\u00e9, le prompt inject\u00e9 contient seulement les instructions (pas de contenu en double)',
      'Titre de la note visible en haut du panneau lat\u00e9ral (\u00e9ditable inline)',
    ],
  },
  {
    version: '1.3.3',
    title: 'Dossiers \/ Projets',
    items: [
      'Dossiers : regroupez vos notes dans des projets nommés (style ChatGPT/Claude)',
      'Drag & drop : faites glisser une note sur un dossier pour l\'y assigner',
      'Créer, renommer, supprimer des dossiers directement dans l\'historique',
      'Notes libres : les notes sans dossier restent accessibles dans la section "Notes"',
      'Fullscreen : filtrage par dossier via des pills en haut de la sidebar',
      'Suppression de dossier non-destructive : les notes redeviennent libres',
      'Export/import JSON et sauvegarde backup incluent les dossiers automatiquement',
    ],
  },
  {
    version: '1.3.2',
    title: 'Logs Sync détaillés',
    items: [
      'Log de chaque note synquée avec succès dans forceSyncAll (console.log par note)',
      'Log enrichi dans syncNoteToJournal : affiche le titre de la note en cas d\'erreur',
      'AccountView : affichage de la liste détaillée des échecs (titre + message d\'erreur)',
    ],
  },
  {
    version: '1.3.1',
    title: 'Export DOCX & Diagnostics Sync',
    items: [
      'Export Google Docs (.docx) : nouveau bouton dropdown PDF / Google Docs dans l\'en-tête',
      'docx-export.ts : génération de fichier .docx avec images, header/footer via la librairie docx@9',
      'AccountView : affichage du résultat de sync manuelle (N synquée(s) · N échec(s))',
      'ForceSyncAll : log console.warn par note échouée pour diagnostic dans DevTools',
    ],
  },
  {
    version: '1.3.0',
    title: 'Compte AOKnowledge & Cloud Sync',
    items: [
      'Compte AOKnowledge : connexion Google OAuth via le bouton 👤 du footer',
      'Synchronisation cloud automatique vers Journal d\'Études à chaque nouvelle note capturée',
      'AccountView dédiée : profil utilisateur, toggle sync automatique, sync manuelle globale',
      'Déduplication intelligente : une même URL ne crée qu\'un seul nœud dans le journal',
      'Supabase Auth centralisé — même compte pour toutes les apps AOKnowledge',
      'Threads d\'analyse IA : définir une URL de thread cible par provider (ChatGPT, Claude, etc.)',
      'Smart Capture v1 : stratégies topstep.com (dashboard, comptes, billing, payouts)',
    ],
  },
  {
    version: '1.2.5',
    title: 'Smart Capture par domaine',
    items: [
      'Capture intelligente spécifique par site : TradingView, Skool, TopStepX, Forex Factory, Investing.com, Gmail, Outlook, Tradovate',
      'TradingView : extraction automatique du symbole, prix, variation, timeframe et contrat futures',
      'TopStepX Trade : extraction de la balance, P&L réalisé/non-réalisé, max loss limit depuis la barre du haut',
      'TopStepX Stats : extraction des KPIs (Total PNL, Trade Win %, Day Win %, Profit Factor, Avg Win/Loss)',
      'Skool : extraction du titre de post, auteur, groupe, contenu principal et engagement',
      'Forex Factory / Investing.com : extraction des événements du calendrier économique (heure, devise, impact, forecast)',
      'YouTube amélioré : capture du timestamp de lecture + lien avec ?t=, chapitres, transcription',
      'Gmail / Outlook : extraction du sujet, expéditeur, date et corps de l\'email',
      'Fallback GenericArticle pour blogs/Wordpress/Notion avec nettoyage du contenu',
      'Architecture extensible : ajout facile de nouvelles stratégies par domaine',
      'Fallback automatique sur l\'extracteur générique si la stratégie échoue',
    ],
  },
  {
    version: '1.2.4',
    title: 'Analyse IA multi-provider',
    items: [
      'Support de 5 providers : ChatGPT, Claude, Gemini, Perplexity, Grok',
      'Injection automatique du texte et upload PDF sur chaque provider',
      'Dropdown neutre de sélection du provider',
      'Upload dynamique : clics automatiques pour révéler le champ d\'upload (Gemini, Claude, Grok)',
    ],
  },
  {
    version: '1.2.3',
    title: 'Analyse IA ChatGPT + Stabilisation',
    items: [
      'Analyse IA ChatGPT avec 3 prompts + prompt libre',
      'Pré-remplissage automatique via ?q= pour les notes texte',
      'Tab Picker pour capture plein écran',
      'Utilitaires de formatage de date (formatSmartDate, formatCompactDate)',
      'Stabilisation UI et corrections de style',
    ],
  },
  {
    version: '1.2.0',
    title: 'Pipeline analyse IA',
    items: [
      'Génération PDF en mémoire (aucun téléchargement)',
      'Injection automatique dans ChatGPT via DataTransfer',
      'Callout images détectées avec feedback visuel',
      'Fallback clipboard + téléchargement PDF',
    ],
  },
  {
    version: '1.1.0',
    title: 'Refonte UI + Mode plein écran',
    items: [
      'Interface style messagerie (messages individuels)',
      'Mode plein écran avec sidebar de notes',
      'Éditeur enrichi (gras, italique, images)',
      'Export/Import JSON des données',
    ],
  },
  {
    version: '1.0.x',
    title: 'Fondations',
    items: [
      'Capture intelligente de pages web',
      'Screenshots intégrés',
      'Stockage local IndexedDB',
      'Mode sombre / clair',
      'Raccourcis clavier',
    ],
  },
]

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[1.75rem] h-6 px-1.5 text-xs font-mono font-medium bg-muted border border-border rounded shadow-sm">
      {children}
    </kbd>
  )
}

function Section({ icon: Icon, title, children }: { icon: typeof Keyboard; title: string; children: React.ReactNode }) {
  return (
    <section className="bg-card border border-border rounded-xl p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-muted rounded-lg">
          <Icon size={18} className="text-foreground" />
        </div>
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      </div>
      {children}
    </section>
  )
}

// Feuille de route publique — le teaser des chantiers à venir, sans détail
// business. Alimentée au fil des livraisons (source interne : TODO.md).
const ROADMAP = [
  {
    title: 'Mode mentorat',
    desc: 'Ton suivi de progression chiffré et un plan d\'évolution proposé par l\'IA puis validé par un mentor humain. Option payante, le carnet gratuit reste entier.',
  },
  {
    title: 'Capture intelligente nouvelle génération',
    desc: 'La capture de page repensée et propulsée par l\'IA pour des résumés vraiment utiles.',
  },
  {
    title: 'Transcription vidéo',
    desc: 'Le même moteur local que la dictée vocale, appliqué aux vidéos que tu étudies.',
  },
  {
    title: 'Forfaits dans l\'extension',
    desc: 'Voir et gérer son forfait directement depuis le panneau, sans passer par le site.',
  },
]

type GuidePage = 'pratiques' | 'versions'

export default function GuideApp() {
  const isMac = navigator.platform.toUpperCase().includes('MAC')

  // DEUX ÉCRANS distincts (retour Brice 28/08 : pas une ancre, deux pages) :
  // « Bonnes pratiques » (raccourcis, utilisation typique, bonnes pratiques)
  // et « Versions » (feuille de route + historique). Le menu ⚙️ ouvre l'un ou
  // l'autre via le hash ; les onglets d'en-tête permettent de basculer.
  const [page, setPage] = useState<GuidePage>(
    window.location.hash === '#versions' ? 'versions' : 'pratiques'
  )
  useEffect(() => {
    window.history.replaceState(null, '', page === 'versions' ? '#versions' : '#pratiques')
    window.scrollTo(0, 0)
  }, [page])

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => window.close()}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
              title="Fermer"
              aria-label="Fermer"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 className="text-xl font-bold text-foreground">Le Carnet du Trader</h1>
              <p className="text-xs text-muted-foreground">
                {page === 'versions' ? 'Versions et feuille de route' : 'Guide d\'utilisation'} — v{version}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-0.5 rounded-lg bg-muted/60 p-0.5">
              <button
                onClick={() => setPage('pratiques')}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${page === 'pratiques' ? 'bg-background text-foreground shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Bonnes pratiques
              </button>
              <button
                onClick={() => setPage('versions')}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${page === 'versions' ? 'bg-background text-foreground shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Versions
              </button>
            </div>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">

        {page === 'pratiques' && (<>
        {/* Raccourcis clavier */}
        <Section icon={Keyboard} title="Raccourcis clavier">
          <div className="space-y-3">
            {SHORTCUTS.map((s, i) => (
              <div key={i} className="flex items-center justify-between gap-4">
                <span className="text-sm text-muted-foreground">{s.desc}</span>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {(isMac ? s.mac : s.keys).map((k, j) => (
                    <React.Fragment key={j}>
                      {j > 0 && <span className="text-muted-foreground/40 text-xs">+</span>}
                      <Kbd>{k === 'Cmd' ? '\u2318' : k}</Kbd>
                    </React.Fragment>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Utilisation typique */}
        <Section icon={BookOpen} title="Utilisation typique">
          <div className="space-y-5">
            {WORKFLOWS.map((w, i) => (
              <div key={i}>
                <h3 className="text-sm font-semibold text-foreground mb-2">{w.title}</h3>
                <ol className="space-y-1.5 ml-4">
                  {w.steps.map((step, j) => (
                    <li key={j} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-xs font-medium text-muted-foreground/60 mt-0.5 flex-shrink-0">{j + 1}.</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </Section>

        {/* Bonnes pratiques */}
        <Section icon={Lightbulb} title="Bonnes pratiques">
          <ul className="space-y-2.5">
            {TIPS.map((tip, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                <Command size={14} className="text-muted-foreground/40 flex-shrink-0 mt-0.5" />
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </Section>
        </>)}

        {page === 'versions' && (<>
        {/* Feuille de route */}
        <Section icon={Map} title="Feuille de route">
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Ce qui arrive dans les prochaines versions. La liste bouge au rythme de vos retours.
            </p>
            {ROADMAP.map((r, i) => (
              <div key={i}>
                <h3 className="text-sm font-semibold text-foreground mb-1">{r.title}</h3>
                <p className="text-sm text-muted-foreground ml-4">{r.desc}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* Changelog */}
        <Section icon={Clock} title="Historique des versions">
          <div className="space-y-5">
            {CHANGELOG.map((entry, i) => (
              <div key={i}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-sm font-semibold text-foreground">v{entry.version}</span>
                  <span className="text-xs text-muted-foreground">— {entry.title}</span>
                </div>
                <ul className="space-y-1 ml-4">
                  {entry.items.map((item, j) => (
                    <li key={j} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-muted-foreground/40 mt-1.5 w-1 h-1 rounded-full bg-current flex-shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>
        </>)}

        {/* Confidentialité */}
        {page === 'pratiques' && (
        <Section icon={Shield} title="Confidentialit\u00e9">
          <div className="space-y-2.5">
            {[
              'Toutes vos notes sont stockées localement sur votre appareil (IndexedDB).',
              'Aucune donnée personnelle n\'est collectée ni transmise.',
              'Aucun tracker, aucun analytics, aucun cookie tiers.',
              'L\'analyse IA ouvre le provider dans un nouvel onglet — vos données ne transitent pas par nos serveurs.',
            ].map((text, i) => (
              <p key={i} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                <Shield size={14} className="text-green-500/60 flex-shrink-0 mt-0.5" />
                <span>{text}</span>
              </p>
            ))}
          </div>
        </Section>
        )}

        {/* Footer */}
        <div className="text-center py-6 text-xs text-muted-foreground/60">
          Le Carnet du Trader by AOKnowledge — v{version}
        </div>
      </main>
    </div>
  )
}

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
  PackageCheck,
} from 'lucide-react'
import ThemeToggle from '@/components/ThemeToggle'
import { t, tp, getLangue, subscribeLangue, type Langue, type CleI18n } from '@/lib/i18n'
import { chargerLivres } from '@/lib/besoins'
import type { BesoinLivre } from '@/lib/besoins-decouverte'

const version = chrome.runtime.getManifest().version

// Langue (01/10/2026) : le guide passe par le dictionnaire (clés `guide.*`),
// SAUF l'historique des versions (CHANGELOG plus bas), qui reste rédigé en
// français. Le traduire voudrait dire écrire chaque release note en deux
// langues à l'avenir : c'est une décision de Brice, pas un détail de code.
// En anglais, une ligne le dit au-dessus de l'historique.
//
// Les constantes portent des CLÉS, pas des textes : la page suit le drapeau du
// panneau sans être rechargée, et un texte figé au chargement du module ne
// changerait pas de langue.

// Les touches nommées changent de nom avec la langue (Entrée / Enter).
const TOUCHES: Record<string, CleI18n> = {
  'Entrée': 'guide.toucheEntree',
  'Échap': 'guide.toucheEchap',
}

const SHORTCUTS: { keys: string[]; mac: string[]; desc: CleI18n }[] = [
  { keys: ['Ctrl', 'Shift', 'A'], mac: ['Cmd', 'Shift', 'A'], desc: 'guide.raccourciPanneau' },
  { keys: ['Alt', 'Shift', 'C'], mac: ['Opt', 'Shift', 'C'], desc: 'guide.raccourciCapture' },
  { keys: ['Ctrl', 'B'], mac: ['Cmd', 'B'], desc: 'guide.raccourciGras' },
  { keys: ['Ctrl', 'I'], mac: ['Cmd', 'I'], desc: 'guide.raccourciItalique' },
  { keys: ['Ctrl', 'U'], mac: ['Cmd', 'U'], desc: 'guide.raccourciSouligner' },
  { keys: ['Ctrl', 'Shift', 'S'], mac: ['Cmd', 'Shift', 'S'], desc: 'guide.raccourciEcran' },
  { keys: ['Ctrl', 'Shift', 'I'], mac: ['Cmd', 'Shift', 'I'], desc: 'guide.raccourciImage' },
  { keys: ['Entrée'], mac: ['Entrée'], desc: 'guide.raccourciEnvoyer' },
  { keys: ['Shift', 'Entrée'], mac: ['Shift', 'Entrée'], desc: 'guide.raccourciLigne' },
  { keys: ['Échap'], mac: ['Échap'], desc: 'guide.raccourciFermer' },
]

// Page « Bonnes pratiques » passée au tutoiement le 02/10/2026, comme le reste
// de l'app, en même temps que la réécriture de « Analyser une note avec une
// IA » (les types neutre / mentor / action / libre n'existaient plus).
const WORKFLOWS: { title: CleI18n; steps: CleI18n[] }[] = [
  {
    title: 'guide.flowCapture',
    steps: [
      'guide.flowCapture1',
      'guide.flowCapture2',
      'guide.flowCapture3',
      'guide.flowCapture4',
    ],
  },
  {
    title: 'guide.flowPleinEcran',
    steps: [
      'guide.flowPleinEcran1',
      'guide.flowPleinEcran2',
      'guide.flowPleinEcran3',
    ],
  },
  {
    title: 'guide.flowAnalyse',
    steps: [
      'guide.flowAnalyse1',
      'guide.flowAnalyse2',
      'guide.flowAnalyse3',
      'guide.flowAnalyse4',
      'guide.flowAnalyse5',
    ],
  },
]

const TIPS: CleI18n[] = [
  'guide.conseil1',
  'guide.conseil2',
  'guide.conseil3',
  'guide.conseil4',
  'guide.conseil5',
]

// Ce que deviennent les données de l'élève. Réécrit le 02/10/2026 : l'ancienne
// version promettait que rien n'était collecté ni transmis et que tout restait
// en local, ce que la synchronisation avec le journal, la capture intelligente
// et le mentor démentaient depuis longtemps. Chaque phrase est vérifiée dans le
// code (storage.saveNote, sync.ts, capture-ia.ts, AnalyzeNoteDialog) : ne rien
// promettre ici que le code ne tienne pas. La coupure de la sync n'est citée
// que depuis qu'elle coupe vraiment l'envoi automatique (1.8.10, voir
// envoiAutoPermis dans storage.ts). Mêmes engagements que la politique de
// confidentialité publiée (privacy-policy.html) : les tenir alignés.
// Les textes vivent dans le dictionnaire (clés `guide.confidentialite1` à `9`) :
// toute modification de fond se fait des deux côtés, FR puis EN. La 8
// (1.8.14) : « Envoyer un diagnostic », qui ne part qu'au clic du membre. La 9
// (1.8.14) : « Lire une capture », l'image envoyée à l'IA à son geste. La 10
// (1.8.15) : « Il me manque quelque chose » et les signaux de friction
// (section 6 de la politique publiée).
const CONFIDENTIALITE: CleI18n[] = [
  'guide.confidentialite1',
  'guide.confidentialite2',
  'guide.confidentialite3',
  'guide.confidentialite4',
  'guide.confidentialite5',
  'guide.confidentialite6',
  'guide.confidentialite7',
  'guide.confidentialite8',
  'guide.confidentialite9',
  'guide.confidentialite10',
]

const CHANGELOG = [
  {
    version: '1.9.2',
    title: 'La nouveauté de la 1.9 : ton point d\'attention avant la séance',
    items: [
      "Quand tu lances ton warmup, le Carnet te remontre l'erreur qui revient le plus dans tes derniers jugements, avec tes propres mots. Il apparaît en tête du warmup quand au moins 3 de tes jugements en B− ou moins des 14 derniers jours viennent de la même cause (technique, connaissance ou émotionnelle). En dessous, il ne s'affiche pas.",
      "Il reprend la phrase de ton jugement le plus récent pour cette cause et te pose une question : qu'est-ce que tu fais différemment aujourd'hui ? Si deux causes reviennent autant l'une que l'autre, il te montre les deux et tu choisis celle que tu gardes en tête.",
      "« Je le garde en tête » le range en pastille au-dessus de ton objectif du jour, pour cette séance. La croix le ferme. Tout se calcule dans ton Carnet, sur tes notes : pas d'IA, rien ne part.",
      "À l'ouverture d'une nouvelle note, une ligne discrète te propose un warmup avant de commencer. Elle part dès que tu la fermes ou que tu lances le warmup, et ne revient pas dans la même note.",
    ],
  },
  {
    version: '1.9.1',
    title: 'Le menu du clic droit fait enfin ce qu\'il dit',
    items: [
      "« Capturer cette page », dans le menu du clic droit, ne faisait rien de visible. Il ouvre maintenant le Carnet et lance la capture intelligente, comme le bouton du panneau : dans ta note ouverte s'il y en a une, sinon dans une note neuve. Le raccourci Alt+Maj+C fait la même chose.",
      "« Capturer la sélection » ouvre le Carnet et pose le texte choisi dans ta note, avec la page d'où il vient. « Prendre une capture d'écran » ouvre le Carnet et pose la capture de la page.",
    ],
  },
  {
    version: '1.9.0',
    title: 'Soutenir le Carnet, quand il est déjà compris dans ta formule',
    items: [
      "Si le Carnet Premium est compris dans ton Live Club, ton 10% Club, ta Formation ou ton accompagnement, « Mon forfait » montre une ligne discrète « Soutenir le Carnet », sous « Tout est déjà ouvert ». Elle se déplie : le prix de l'abonnement, ce que ça change, et un bouton.",
      "Rien de plus n'est débloqué aujourd'hui : tout est déjà ouvert pour toi. Ton soutien continue si la formule qui incluait le Carnet s'arrête, et tu reçois un badge « Soutien » sur ton compte.",
      "Quand tu soutiens le Carnet, « Mon forfait » te le dit, avec le lien pour gérer ou arrêter ton soutien. Tu arrêtes quand tu veux.",
    ],
  },
  {
    version: '1.8.17',
    title: "Le mentor te dit quoi faire quand il ne peut pas répondre, et ton prix d'entrée dans « Prix »",
    items: [
      "Pas connecté : le mentor et « Approfondir » ne s'arrêtent plus sans rien dire. L'écran du mentor te dit que tu n'es pas connecté, avec un bouton « Me connecter ».",
      "Si ton Carnet est en retard sur le Store et que le mentor ne répond plus, il te le dit : « Une mise à jour du Carnet est disponible », un bouton pour l'installer, et la marche à suivre si rien ne change.",
      "L'analyse de tes notes et le mentor ont chacun une ligne qui dit leur rôle : l'analyse donne un débrief brut, que tu peux envoyer à ton IA ; le mentor te répond avec un plan d'action.",
      "Quand tu choisis ce que le mentor peut lire, une phrase dit ce qu'il lira : tout le carnet, ou seulement les dossiers cochés et leurs sous-dossiers.",
      "Sur un trade sans R, la pastille « Prix » montre ton prix d'entrée (tapé, ou celui du trade du broker lié) : « Prix · 21 450 ». Avec un R, elle garde « Prix · +2 R ».",
    ],
  },
  {
    version: '1.8.16',
    title: 'Un trade de ta note lié à Pilotage en un clic, et ton R dans « Prix »',
    items: [
      'Nouveau : sur un trade clos, l\'icône lien, à côté du résultat, lie le trade de ta note à un trade importé de Pilotage. Un clic ouvre la liste : les trades du broker du jour du trade, du même instrument, le plus proche de l\'heure en tête. Un clic sur « Lier » et c\'est fait, même pour une note faite il y a longtemps.',
      'Une fois lié, l\'icône est pleine. Un clic te montre le trade du broker (prix, heure, compte) et « Délier » défait le lien. Rien d\'importé ce jour-là : importe l\'export d\'ici, ou dans Pilotage avec « Déposer mes documents ». Le lien ne touche pas à tes prix : Pilotage dit ce que le broker a fait, ton Carnet garde ce que tu avais prévu.',
      'La pastille « R ? » quitte la rangée : ton R se tape maintenant dans « Prix », sous la sortie. Quand tes prix permettent de le calculer, la carte le montre et le garde si tu laisses le champ vide. Dès qu\'il est connu, la pastille l\'affiche : « Prix · +2 R ». Les R que tu avais déjà saisis restent.',
    ],
  },
  {
    version: '1.8.15',
    title: 'Le plein écran fait tout ce que fait le panneau, et tu peux nous dire ce qui te manque',
    items: [
      'En plein écran, tu peux lancer un trade depuis la barre d\'écriture, comme dans le panneau. Le graphique TradingView est capturé au lancement s\'il est affiché dans une autre fenêtre, et changer de note clôt le trade en cours. Le plein écran prend aussi le thème du panneau (clair, sombre ou celui de ton appareil) et le suit si tu le changes, la « Capture intelligente » y garde son aura quand l\'IA est ouverte sur ton compte, et si l\'export en PDF ou en Word échoue, un message te le dit.',
      'En plein écran, la rangée « Poser un DOL », « Lancer un warmup » et « Approfondir » est maintenant juste au-dessus de la barre d\'écriture, comme dans le panneau. Mêmes gestes, même comportement.',
      'Correction : quand l\'étude d\'« Approfondir » ajoutait des concepts ou des tags à la note, son bloc « Étude de la note » pouvait disparaître aussitôt écrit. Il reste maintenant dans la note.',
      'Nouveau : « Il me manque quelque chose ». En bas du panneau, le Support s\'appelle maintenant « Aide et idées » : tu y poses ta question, ou tu nous dis ce qui te manque, avec une capture si tu veux. La même ligne est dans le menu de la roue. Avant d\'écrire, tu vois ce qui est « Déjà prévu » : si ton besoin y est, un clic sur « Moi aussi » suffit.',
      'Quand le Carnet bute (une page qu\'il n\'arrive pas à capturer, une synchronisation ou un export qui échoue), une ligne te propose de nous le dire, avec le message déjà commencé. Et dans « Versions et feuille de route », une section « Livré grâce à vos demandes » montre ce qui est sorti parce que vous l\'avez demandé.',
      'En plein écran, tout le bas du panneau est là aussi : la version, la langue, l\'état de ta synchronisation, le thème, « Aide et idées », le mentorat et le menu de la roue (ton compte, les paramètres, l\'import de tes trades, le Guide, le diagnostic, ton forfait...). Chaque écran s\'ouvre à la place de la note, et « Me connecter » ouvre ton compte sur place.',
      'En plein écran, sans note ouverte, tu retrouves l\'accueil du panneau : « Capture intelligente », « Capturer cette page » (tu choisis l\'onglet), ta dernière note et ton activité.',
      'En plein écran, la barre de gauche est maintenant l\'Historique du panneau : la recherche, « à trier » et tes tags, tes dossiers (créer, renommer, supprimer, ajouter un sous-dossier), et une note glissée sur un dossier s\'y range. Les pastilles de dossiers laissent la place à cet arbre. Un dossier créé ou renommé d\'un côté apparaît aussitôt de l\'autre, et supprimer la note que tu as ouverte te ramène à l\'accueil.',
      'En plein écran, une capture d\'écran prise avec une note ouverte va directement dans la note, comme dans le panneau, et elle retient la page que tu as choisie, pas le plein écran lui-même. Et quand « Approfondir » est réservé au Carnet Premium, le plein écran t\'ouvre l\'écran qui explique ton forfait, et plus seulement un message.',
      'Le plein écran ouvert seul fait aussi ce que le panneau fait en coulisse : renvoyer au journal les notes restées « à synchroniser », mettre à jour ton activité, préparer ta note « Mentorat AOK ». Si les deux sont ouverts, un seul s\'en charge, jamais les deux en même temps.',
    ],
  },
  {
    version: '1.8.14',
    title: 'Ta carte de prix lit ton panneau d\'ordre, un diagnostic à nous envoyer, un affichage de secours',
    items: [
      'Nouveau : la carte de prix d\'un trade (pastille « Prix ») prend ce que tu règles dans le panneau d\'ordre de TradingView. Le sens (Achat ou Vente), choisi par toi : il prime sur celui que le Carnet déduit de ton stop, pour « Lier » comme pour le R. Le type d\'ordre (Marché, Limite, Stop). Le risque, en USD ou en % du compte.',
      'Nouveau : le stop et le TP se tapent en ticks ou en prix, au choix, comme dans TradingView. Le prix reste ce qui est gardé : les ticks sont convertis avec le pas de l\'instrument (NQ, ES et leurs micros 0,25 ; YM 1 ; RTY 0,10 ; GC 0,10 ; CL 0,01...). Instrument inconnu : pas de ticks. La valeur du tick ne se tape pas : le Carnet propose le risque en USD qu\'il en déduit.',
      'Nouveau : « Lire une capture », dans la carte de prix. Dépose ou colle une capture de ton panneau d\'ordre ou de l\'outil Position, ou prends en un clic la capture du lancement du trade : l\'IA remplit la carte, les champs remplis sont surlignés, tu vérifies, puis tu enregistres. Ce que tu avais déjà tapé n\'est remplacé que si tu le demandes. Une lecture compte dans tes lectures du mois, comme l\'import de tes trades.',
      'Sur un trade clos, la pastille « R ? » propose le R calculé d\'après ta carte de prix : Entrée pour le garder.',
      'Nouveau : « Envoyer un diagnostic », dans le menu de la roue. Quand un souci ne se reproduit que chez toi, il nous donne en un clic ce qu\'il faut pour le régler : la version du Carnet, ton navigateur, ta carte graphique, ton écran et ton zoom, les dernières erreurs, et le déroulé du dernier envoi vers une IA (quel champ a été trouvé, quelle voie a marché ou non). Rien de tes notes n\'est envoyé, et tu vois exactement ce qui part avant d\'envoyer. Pas connecté, ou tu préfères passer par Telegram : « Copier ».',
      'Nouveau : « Affichage de secours », dans Paramètres. Si l\'écran laisse des traces, par exemple une image qui se dessine une deuxième fois au survol, il coupe les animations, les flous et les ombres lourdes. Le reste de l\'affichage ne change pas. Éteint par défaut.',
      'Merci Franky et Flow : c\'est pour vos deux soucis qu\'on l\'a construit.',
    ],
  },
  {
    version: '1.8.13',
    title: 'Tes trades du broker, importés depuis le Carnet',
    items: [
      'Nouveau : « Importer mes trades », dans le menu de la roue en bas du panneau. Dépose l\'export de ton broker (CSV, PDF, capture ou relevé MetaTrader) : le Carnet le fait lire comme Pilotage, devine le compte d\'après le fichier et range les trades au même endroit, dans tes comptes Pilotage. Il ne te demande le compte qu\'en cas de doute.',
      'Le Carnet connaît tes comptes Pilotage dès que tu ouvres Pilotage dans le même Chrome. Un compte que Pilotage ne connaît pas encore se crée en un clic, et la boîte s\'y retrouve toute seule au retour. Un document qui n\'est pas un export de trades (facture, relevé bancaire) se dépose dans Pilotage.',
      'Copy trading : un même export peut porter plusieurs comptes, chacun garde ses trades. Et le même rapport déposé en CSV et en PDF n\'est rangé qu\'une fois.',
      '« Lier », dans la pastille « Prix » d\'un trade : la liste montre les trades du broker du jour du trade, même pour une vieille note, et du même instrument (lu sur le graphique de la note, modifiable d\'un clic). Tes comptes copiés tiennent sur une seule ligne : « Lier les 3 ». Rien d\'importé ce jour-là : « Importer l\'export de ce jour ».',
      '« Ma position » : ton prévu (entrée, stop, TP, taille, sortie et clôtures partielles) à côté de ce que dit le broker, une fois le trade lié. Ton prévu reste dans ton Carnet : Pilotage ne lit que les trades de ton broker.',
      '« Approfondir » est descendu à côté de « Poser un DOL » et « Lancer un warmup », juste au-dessus de la barre d\'écriture : tu peux approfondir plusieurs fois pendant que la note s\'écrit, sans remonter en haut.',
      'Nouveau : quand tu lances un trade, puis quand tu le clôtures, le Carnet capture ton graphique TradingView, tel que tu le vois, et le range dans le trade avec le moment, le symbole, l\'unité de temps et l\'heure. Seulement si TradingView montre l\'actif du trade, jamais un autre site ; un écran par fenêtre si tu en as plusieurs. Une capture en trop se supprime comme les autres, et tout se coupe dans Paramètres.',
    ],
  },
  {
    version: '1.8.12',
    title: 'Les prix de tes trades, et le PDF qui arrive vraiment',
    items: [
      'Nouveau : sur chaque trade clos d\'une note, la pastille « Prix » ouvre un petit panneau pour noter l\'entrée, la sortie et la taille. Ces prix restent dans ton Carnet (et ton Journal d\'Études) : Pilotage, lui, ne lit que les trades de ton broker.',
      'Nouveau, au même endroit : si tu as importé ton relevé du broker dans Pilotage, le Carnet te montre les trades importés autour de l\'heure du tien. Un clic sur « Lier » relie les deux, et ton jugement comme ton cooldown rejoignent le vrai trade. « Délier » défait le lien.',
      'Correction : analyser une note dans une conversation ChatGPT existante pouvait afficher « PDF envoyé » sans que le PDF arrive. Le Carnet attend maintenant que la conversation ait fini de charger, vérifie que la pièce jointe apparaît bien, et réessaie autrement sinon. S\'il ne la voit toujours pas, il te le dit et te propose le PDF à glisser toi-même. Merci Flow pour les captures.',
      'Correction : le fantôme au survol des images revenait encore. Les petits boutons qui apparaissent au survol d\'un bloc (poubelle, heure, « + tag ») ne s\'affichent plus en fondu, mais d\'un coup : c\'est ce fondu qui faisait repeindre l\'image plus haut. Merci Franky pour la nouvelle vidéo.',
    ],
  },
  {
    version: '1.8.11',
    title: 'Connexion plus claire, et un fantôme de moins',
    items: [
      'Connexion plus claire : quand la connexion est refusée, le message t\'explique pourquoi en français (souvent, un compte créé avec Google, donc sans mot de passe). Si tu t\'inscris avec un email qui a déjà un compte, le Carnet le repère et te propose « Mot de passe oublié ? ». La réinitialisation passe maintenant par journal.aoknowledge.com, et si tu es déjà client AOKnowledge, l\'écran Compte te rappelle d\'utiliser l\'email de ton achat : tes accès s\'ouvrent tout seuls.',
      'Correction : en survolant une image de ta note, elle pouvait s\'afficher une deuxième fois, plus haut, par-dessus le texte du dessus. Rien n\'était abîmé dans la note. C\'était le léger assombrissement de l\'image au survol : il est retiré, le curseur loupe suffit à dire qu\'elle s\'agrandit au clic. Merci encore Franky pour la vidéo.',
    ],
  },
  {
    version: '1.8.10',
    title: 'Ton activité, et tes données entre tes mains',
    items: [
      'Nouveau sur l\'accueil : ton activité des 12 derniers mois, une case par jour, plus foncée les jours où tu notes, captures, parles à ton mentor, juges tes trades ou rouvres tes notes. Survole une case pour voir le détail de la journée, et garde un œil sur ta série en cours.',
      'Nouveau : tu peux supprimer un trade. Au survol de sa rangée, la corbeille le retire sans toucher à ce qu\'il contient : ses blocs restent dans la note, à leur place, comme des blocs normaux.',
      'La synchronisation avec ton Journal d\'Études se coupe vraiment : dans ton Compte, l\'interrupteur est activé par défaut, et si tu le coupes, une fenêtre te dit ce que ça change avant de valider. « Exclure de la sync » sur une note est aussi respecté quand tu la modifies.',
      'Avec la synchronisation, les compteurs de ton panneau d\'activité remontent aussi au journal : des nombres par jour, sans aucun contenu. Ils nous aident à voir comment nos apps sont utilisées, pour les améliorer.',
      'Bonnes pratiques : la section « Confidentialité » dit précisément ce qui reste sur ton appareil et ce qui passe par nos serveurs, et « Analyser une note avec une IA » décrit les consignes telles qu\'elles sont aujourd\'hui. La politique de confidentialité de l\'extension est mise à jour dans le même sens.',
      'Analyser avec une IA : quand ChatGPT n\'accepte que des images (c\'est le cas si tu n\'es pas connecté à ton compte), le PDF de ta note ne peut pas partir. Le Carnet te le dit maintenant et t\'invite à te connecter, puis à relancer. Avant, le prompt partait seul, sans explication.',
    ],
  },
  {
    version: '1.8.9',
    title: 'La note s’édite quand tu le décides',
    items: [
      'Changement de fond : cliquer sur un texte ne l’édite plus. Pour éditer : double-clique, ou le crayon dans la pastille au survol du bloc. Le clic redevient un geste sans risque — fini les éditions ouvertes sans le vouloir.',
      'Nouveau : sélectionne plusieurs blocs comme dans une messagerie (la coche dans la pastille d’un bloc ouvre le mode), puis « Grouper sous un trade » : le trade est créé après coup, sur la plage de temps des blocs choisis. Tu avais oublié de lancer le trade au moment de ta position ? Maintenant tu reviens en arrière.',
      'Nouveau, discret : la note D. Désactivée par défaut — un interrupteur « Noter jusqu’à D » dans les Paramètres l’ajoute sous le C, avec ses nuances D+ et D−. Tes statistiques et le mentor la comptent, mais elle n’apparaît nulle part tant que tu n’en poses pas.',
      'Et un cran de contraste sur la rangée d’un trade (Résultat ?, R ?, notation, cooldown) : elle était trop pâle.',
    ],
  },
  {
    version: '1.8.8',
    title: 'Les tags viennent à toi',
    items: [
      'Nouveau : « tags auto » à côté du + tag de la note. L’IA lit ta note déjà écrite — tout le texte, plus un échantillon de trois images (début, milieu, fin : une leçon change de sujet en route) — et pose des tags ET des concepts, sans rien capturer, sans toucher au contenu. Tes tags posés à la main restent. Un clic = un seul appel, au même tarif qu’une capture, sur ton forfait habituel.',
      'Correction : en plein écran, le bouton « Analyser avec une IA » n’ouvrait rien. Il ouvre.',
      'Correction : la pastille « + tag » d’un bloc disparaissait quand le curseur quittait le texte pour l’atteindre — il y avait 2 pixels de vide entre les deux, et le survol s’y perdait. Le vide est comblé, la pastille t’attend.',
    ],
  },
  {
    version: '1.8.7',
    title: 'Le mentor apprend à compter',
    items: [
      'Nouveau : sur un trade clos, une petite pastille « R ? » à côté du résultat. Tu y saisis ton résultat en R (multiple du risque : +1,5, −1, +0,3), en deux secondes, avec la virgule si tu veux. Optionnel, effaçable, jamais un montant de compte.',
      'Ce R débloque l’étage chiffré du mentor : total en R sur la période, gagnant moyen contre perdant moyen, win rate d’équilibre à ton ratio, et le R par grade — « tes B t’ont coûté −5,2 R » devient une phrase possible.',
      'Le brief du mentor lit aussi ce qu’il savait déjà sans le dire : la répartition de tes trades par jour de semaine et par heure d’entrée (heure de Paris), le pourcentage de A mois par mois (ta sélectivité), et tes cinq derniers jugements B/C dans tes propres mots.',
      'Rien à ressaisir : tout le reste vient de ce que tu notes déjà.',
      'Correction : sur TradingView, la capture lisait « 3m » (3 minutes) comme « 3M » (3 mois) — la casse est maintenant respectée, et l’unité de temps s’écrit en toutes lettres dans la note (« 3 minutes ») pour que le doute ne revienne jamais.',
      'Correction : en survolant un bloc de texte, le paragraphe pouvait s’afficher une deuxième fois, décalé et par-dessus l’image du dessus. C’était une animation de trop — rien n’était abîmé dans la note, et ça disparaissait en bougeant la souris. Merci Franky pour la vidéo.',
      'Correction : la pastille de survol (date, « + tag », corbeille) se posait à cheval sur la première ligne du bloc et en cachait les premiers mots. Elle passe entièrement au-dessus.',
    ],
  },
  {
    version: '1.8.6',
    title: 'La notation apprend les nuances',
    items: [
      'Les grades acceptent les nuances : A+, A−, B+, B−, C+, C−. Chaque bouton du popover de notation porte deux petits flancs − et + ; le centre garde le geste habituel, un flanc donne directement la nuance. Rien d’obligatoire : A, B, C tout court marchent comme avant.',
      'Quand tu poses un + ou un −, la question du champ change : « Pourquoi ce + ? ». C’est la vraie matière : pas la note, mais ce qui te la fait sentir.',
      'La relecture dans le journal parle le même langage : les boutons A/B/C de la file de relecture portent les mêmes flancs.',
      'Les statistiques restent lisibles : elles comptent par lettre (un B+ et un B− restent des B). La nuance nourrit le brief du mentor : qualité moyenne sur une échelle de C− à A+, et sa tendance sur la période.',
      'Tes jugements déjà posés ne bougent pas : un B d’avant reste un B, la valeur neutre.',
    ],
  },
  {
    version: '1.8.5',
    title: 'La capture lit ton journal pour de vrai',
    items: [
      'Capturer ton canvas du Journal d\'Études lit maintenant les VRAIES notes derrière les cartes visibles — et les liens que tu as tracés entre elles — au lieu du texte de l\'écran. Fini les points clés qui recopiaient des titres tronqués.',
      'Capturer une vidéo YouTube télécharge désormais sa transcription (sous-titres, français en priorité) — la capture lit ce qui se DIT dans la vidéo, plus seulement sa description.',
      'Cette transcription devient un bloc de la note, mis en forme façon Glasp : des paragraphes ouverts par un horodatage cliquable qui ramène à ce moment de la vidéo. Le bloc se replie en tuile intitulée « Transcription », et son panneau de lecture affiche des paragraphes aérés au lieu d’un pavé.',
      'Correction : le + du header fonctionne aussi depuis les écrans mentorat, support ou forfait — il ramène à l\'accueil pour capturer.',
      'Correction : le panneau d\'un bloc affichait « Contenu captur\\u00e9 » au lieu de « Contenu capturé ».',
    ],
  },
  {
    version: '1.8.4',
    title: 'La capture range mieux, et le mentor ne lit que ce que tu veux',
    items: [
      'La capture intelligente pose toujours la même chose, dans le même ordre : la capture d’écran, les points clés, le résumé, puis le texte de la page. Quatre captures dans une note donnent quatre fois cette suite, séparées par ce que tu as écrit entre-temps. Avant, une capture ajoutée à une note déjà ouverte se comportait autrement : le texte passait devant l’image et aucun nouveau point clé n’apparaissait.',
      'Les points clés et le résumé sont maintenant des blocs de la note, avec leur titre et leur couleur. Tu peux donc les corriger, comme n’importe quel bloc. Ils ne sont plus recopiés une seconde fois dans le texte : tu voyais deux résumés l’un sous l’autre.',
      '« Approfondir cette note » ne dépend plus d’avoir commencé par une capture intelligente. Une note écrite à la main y a droit aussi.',
      'Correction : les listes n’avaient jamais de puces, nulle part dans la note. Elles en ont.',
      'Nouveau : la lecture suit la langue de la PAGE et non celle de l’application. Un cours en anglais te revient en anglais, avec ses mots d’origine — traduire fait perdre le sens des termes. Une pastille à droite de « Capture intelligente » permet d’imposer une langue quand tu la veux autrement.',
      'Le liseré arc-en-ciel s’affiche aussi sur le bouton de l’écran d’accueil. Il n’était que dans le menu ＋ alors que c’est le même geste.',
      'Le sélecteur de langue affiche un globe au lieu d’un drapeau : Windows n’a pas de police pour les drapeaux et affichait « FR FR ».',
      'Les points clés apprennent quelque chose au lieu de recopier des intitulés, et le résumé dit ce que la page raconte au lieu de la décrire. Le sujet général d’une page devient une étiquette de note, pas un concept.',
      'Nouveau : au premier passage dans le mode mentorat, on te demande quels dossiers il peut regarder. Ton carnet ne sert probablement pas qu’au trading, et le mentor n’a pas à lire tes notes perso pour parler de tes trades.',
      'Si tu ne coches rien, il lit tout : c’est le cas par défaut, tu n’as aucun geste à faire. Cocher un dossier prend aussi ses sous-dossiers.',
      'Le cadrage vaut pour tout ce qu’il voit — le brief chiffré, les jugements A/B/C, ton retard de relecture et le plan d’évolution. Il ne te reprochera pas un retard sur des notes que tu lui as demandé d’ignorer.',
      'L’icône d’arborescence en haut à droite de l’écran mentorat rouvre le choix quand tu veux.',
      'L’écran mentorat perd son violet : il chargeait la lecture. Le signal « ça part vers l’IA » reste porté par l’anneau du bouton « Demander au mentor ».',
      'Correction : au survol entre deux blocs, le ＋ d’insertion se mélangeait à l’image du dessus et donnait l’impression d’une image en double. C’était de l’affichage seulement, rien n’était abîmé. Il devient une pastille pleine, lisible par-dessus n’importe quelle capture.',
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
// Rafraîchie le 20/09/2026 : les quatre chantiers précédents (mentorat, capture
// IA, transcription vidéo, forfaits) sont livrés depuis la 1.8.x.
const ROADMAP: { title: CleI18n; desc: CleI18n }[] = [
  { title: 'guide.route1', desc: 'guide.route1Desc' },
  { title: 'guide.route2', desc: 'guide.route2Desc' },
  { title: 'guide.route3', desc: 'guide.route3Desc' },
  { title: 'guide.route4', desc: 'guide.route4Desc' },
]

type GuidePage = 'pratiques' | 'versions'

export default function GuideApp() {
  const isMac = navigator.platform.toUpperCase().includes('MAC')

  // Le guide s'ouvre dans un onglet à part : il suit le drapeau du panneau
  // sans rechargement (subscribeLangue écoute aussi les autres documents).
  const [langue, setLangueVue] = useState<Langue>(getLangue)
  useEffect(() => subscribeLangue(setLangueVue), [])
  // La langue déclarée de la page suit, pour les lecteurs d'écran.
  useEffect(() => { document.documentElement.lang = langue }, [langue])

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

  // Besoins des membres, suite du 06/11 (piste D) : « Livré grâce à vos
  // demandes », lu une fois quand l'écran Versions s'ouvre (jamais en fond) ;
  // caché sans compte, sans livraison, ou tant que la route n'est pas en ligne.
  const [livres, setLivres] = useState<BesoinLivre[] | null>(null)
  useEffect(() => {
    if (page !== 'versions' || livres !== null) return
    let vivant = true
    void chargerLivres().then(liste => { if (vivant) setLivres(liste) })
    return () => { vivant = false }
  }, [page, livres])
  const jourDe = (iso: string) => new Intl.DateTimeFormat(langue === 'fr' ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso))

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => window.close()}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
              title={t('commun.fermer')}
              aria-label={t('commun.fermer')}
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 className="text-xl font-bold text-foreground">Le Carnet du Trader</h1>
              <p className="text-xs text-muted-foreground">
                {page === 'versions' ? t('menu.versions') : t('guide.sousTitre')} - v{version}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-0.5 rounded-lg bg-muted/60 p-0.5">
              <button
                onClick={() => setPage('pratiques')}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${page === 'pratiques' ? 'bg-background text-foreground shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {t('menu.bonnesPratiques')}
              </button>
              <button
                onClick={() => setPage('versions')}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${page === 'versions' ? 'bg-background text-foreground shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {t('guide.versions')}
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
        <Section icon={Keyboard} title={t('guide.raccourcis')}>
          <div className="space-y-3">
            {SHORTCUTS.map((s, i) => (
              <div key={i} className="flex items-center justify-between gap-4">
                <span className="text-sm text-muted-foreground">{t(s.desc)}</span>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {(isMac ? s.mac : s.keys).map((k, j) => (
                    <React.Fragment key={j}>
                      {j > 0 && <span className="text-muted-foreground/40 text-xs">+</span>}
                      <Kbd>{k === 'Cmd' ? '\u2318' : TOUCHES[k] ? t(TOUCHES[k]) : k}</Kbd>
                    </React.Fragment>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Utilisation typique */}
        <Section icon={BookOpen} title={t('guide.utilisation')}>
          <div className="space-y-5">
            {WORKFLOWS.map((w, i) => (
              <div key={i}>
                <h3 className="text-sm font-semibold text-foreground mb-2">{t(w.title)}</h3>
                <ol className="space-y-1.5 ml-4">
                  {w.steps.map((step, j) => (
                    <li key={j} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-xs font-medium text-muted-foreground/60 mt-0.5 flex-shrink-0">{j + 1}.</span>
                      <span>{t(step)}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </Section>

        {/* Bonnes pratiques */}
        <Section icon={Lightbulb} title={t('menu.bonnesPratiques')}>
          <ul className="space-y-2.5">
            {TIPS.map((tip, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                <Command size={14} className="text-muted-foreground/40 flex-shrink-0 mt-0.5" />
                <span>{t(tip)}</span>
              </li>
            ))}
          </ul>
        </Section>
        </>)}

        {page === 'versions' && (<>
        {/* Livré grâce à vos demandes (06/11) : la même Section que les autres, rien de dessiné à part. */}
        {livres && livres.length > 0 && (
          <Section icon={PackageCheck} title={t('besoin.livresTitre')}>
            <div className="space-y-4">
              {livres.map(livre => (
                <div key={livre.id}>
                  <h3 className="text-sm font-semibold text-foreground mb-1">{livre.titre}</h3>
                  <p className="text-sm text-muted-foreground ml-4">
                    {[
                      livre.livreLe ? t('besoin.livresDepuis', { date: jourDe(livre.livreLe) }) : null,
                      livre.personnes > 0 ? tp('besoin.livresUn', 'besoin.livresPlur', livre.personnes) : null,
                    ].filter(Boolean).join(', ')}
                  </p>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Feuille de route */}
        <Section icon={Map} title={t('guide.feuilleDeRoute')}>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t('guide.feuilleDeRouteIntro')}
            </p>
            {ROADMAP.map((r, i) => (
              <div key={i}>
                <h3 className="text-sm font-semibold text-foreground mb-1">{t(r.title)}</h3>
                <p className="text-sm text-muted-foreground ml-4">{t(r.desc)}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* Changelog : reste en français (voir l'en-tête du fichier). La
            ligne d'avertissement n'a pas de texte en français : elle ne
            s'affiche que dans les autres langues. */}
        <Section icon={Clock} title={t('guide.historiqueVersions')}>
          {langue !== 'fr' && t('guide.historiqueEnFrancais') && (
            <p className="text-sm text-muted-foreground italic mb-4">{t('guide.historiqueEnFrancais')}</p>
          )}
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
        <Section icon={Shield} title={t('guide.confidentialite')}>
          <div className="space-y-2.5">
            {CONFIDENTIALITE.map((cle, i) => (
              <p key={i} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                <Shield size={14} className="text-green-500/60 flex-shrink-0 mt-0.5" />
                <span>{t(cle)}</span>
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

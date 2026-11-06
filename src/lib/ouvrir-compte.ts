// « Me connecter » depuis le plein écran (1.8.15). Le plein écran n'a pas
// d'écran Compte : il ouvre le panneau latéral et lui demande son écran Compte.
// Deux voies, parce que le panneau peut être déjà ouvert ou pas :
// - le message, pour un panneau déjà ouvert ;
// - la demande en session, lue (puis effacée) par un panneau qui s'ouvre.
export const MESSAGE_OUVRIR_COMPTE = 'CARNET_OUVRIR_COMPTE'
export const DEMANDE_OUVRIR_COMPTE = 'carnetOuvrirCompte'

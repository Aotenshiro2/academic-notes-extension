import { useCallback, useEffect, useRef, useState } from 'react'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { inscrireNewsletter, reconnaitreAdresse, signInWithEmail, signInWithGoogle, verifierCode } from '@/lib/auth'
import {
  LONGUEUR_CODE, SUJET_AOK, SUJET_SUPABASE_INSCRIPTION, SUJET_SUPABASE_LIEN, SUPPORT,
  adresseValide, codeSaisi, codeSurDansEmail, ecranApresEnvoi, estGmail, lienEcrisNous,
  suiteCreation, suiteReconnaissance,
  type EcranConnexion, type Envoi, type IssueCode,
} from '@/lib/connexion-adresse'
import { CLE_SESSION_CARNET } from '@/lib/connexion-lien'
import { oublierAttente } from '@/lib/connexion-lien-extension'
import { useEnvoiCode } from '@/lib/use-envoi-code'
import { t } from '@/lib/i18n'

// L'écran de connexion du Carnet (1.10.1, 16/11/2026) : le parcours de
// aoknowledge.com/connexion, dans le style du Carnet. Un champ email et
// « Continuer » ; le journal reconnaît l'adresse et l'écran montre UNE porte :
// - google      : « Continuer avec Google » (chrome.identity, comme avant),
//                 le lien par email en second ;
// - connue      : le LIEN part par email, écran « Regarde ta boîte » : le
//                 clic dans l'email connecte le Carnet (la page de retour du
//                 journal passe le jeton à l'extension, connexion-lien.ts) ;
// - inconnue    : le Carnet est un produit d'appel : « Créer mon compte
//                 gratuit » est le geste principal (Google en un clic pour un
//                 Gmail), l'adresse du paiement en rappel juste dessous ;
// - rattachee   : adresse secondaire d'un compte, jamais de second compte ;
// - simple      : la route ne répond pas, l'email part quand même (repli).
// Brice, 16/11 : le code à 6 chiffres est « secondaire à la limite » ; il
// reste à un clic sous le lien, comme le mot de passe sous le champ.
// Règles et contrat : lib/connexion-adresse.ts ; appels : lib/auth.ts.

const C = {
  racine: 'space-y-3 px-1',
  titre: 'text-sm font-semibold text-foreground',
  texte: 'text-xs text-muted-foreground leading-relaxed break-words',
  fort: 'text-foreground font-medium',
  label: 'block text-xs text-muted-foreground mb-1.5',
  input: 'w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/40',
  code: 'text-xl tracking-[0.35em] text-center font-mono',
  principal: 'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl btn-primary text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed',
  secondaire: 'w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-border text-sm text-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
  google: `w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-xl
    bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700
    text-sm font-medium text-gray-800 dark:text-gray-200
    hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors
    disabled:opacity-50 disabled:cursor-not-allowed`,
  lien: 'block text-left text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors disabled:opacity-50',
  erreur: 'text-xs text-red-400',
  ok: 'text-xs text-green-500',
  encart: 'rounded-lg border border-border bg-muted/40 px-3 py-2.5',
  pied: 'pt-3 mt-1 border-t border-border text-center',
} as const

function IconeGoogle() {
  return (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  )
}

/** L'adresse de support s'ouvre dans la messagerie du membre (jamais son adresse dans le lien). */
function ecrireAuSupport() {
  chrome.tabs.create({ url: lienEcrisNous() })
}

/** « Toujours bloqué ? Écris-nous » : en bas de chaque porte. */
function Pied() {
  return (
    <p className={C.pied}>
      <button type="button" onClick={ecrireAuSupport} className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2">
        {t('connexion.ecrisNous')}
      </button>
    </p>
  )
}

function BoutonGoogle({ attente, onClick, libelle }: { attente: boolean; onClick: () => void; libelle?: string }) {
  return (
    <button type="button" onClick={onClick} disabled={attente} className={C.google}>
      {attente ? <Loader2 size={15} className="animate-spin" /> : <IconeGoogle />}
      {libelle ?? t('connexion.googleBouton')}
    </button>
  )
}

export default function ConnexionCarnet({ onConnecte }: { onConnecte: () => void }) {
  const [ecran, setEcran] = useState<EcranConnexion>('adresse')
  const [email, setEmail] = useState('')
  const adresse = email.trim()
  const [newsletter, setNewsletter] = useState(false)
  // « Créer mon compte gratuit » choisi : gardé pour « Renvoyer » et le texte du lien.
  const [creation, setCreation] = useState(false)
  const [versGoogle, setVersGoogle] = useState(false)
  const [erreurGoogle, setErreurGoogle] = useState<string | null>(null)
  const envoi = useEnvoiCode()

  // Le mot de passe, en lien secondaire.
  const [motDePasse, setMotDePasse] = useState(false)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** Connecté, par n'importe quelle voie : le Carnet n'attend plus de lien. */
  const connecte = useCallback(() => {
    void oublierAttente()
    onConnecte()
  }, [onConnecte])

  function changer() {
    setEcran('adresse')
    setErreurGoogle(null)
    setVersGoogle(false)
  }

  /** Retour au champ, le mot de passe ouvert (repli : le lien ne connecte pas le Carnet). */
  function versMotDePasse() {
    changer()
    setMotDePasse(true)
  }

  async function continuer() {
    if (ecran === 'verif') return
    if (!adresseValide(adresse)) {
      setError(t('connexion.adresseInvalide'))
      return
    }
    setError(null)
    setEcran('verif')
    const suite = suiteReconnaissance(await reconnaitreAdresse(adresse))
    if (suite === 'envoi') void recevoirLien()
    else setEcran(suite)
  }

  async function recevoirLien(creer = false, renvoi = false) {
    setEcran('boite')
    setCreation(creer)
    setErreurGoogle(null)
    // Revenir sur la même adresse moins d'une minute après : rien ne repart (un envoi annulerait le précédent).
    if (!renvoi && envoi.dejaParti(adresse)) return
    const r = await envoi.envoyer(adresse, { creer, newsletter: creer && newsletter })
    const suite = ecranApresEnvoi(r)
    if (suite !== 'boite') setEcran(suite)
    else if (creer && !renvoi && r.t === 'ok' && newsletter) inscrireNewsletter(adresse)
  }

  async function google(avecAdresse = true) {
    setVersGoogle(true)
    setErreurGoogle(null)
    const { session, error: e } = await signInWithGoogle(avecAdresse ? adresse : null)
    if (session) {
      connecte()
      return
    }
    setVersGoogle(false)
    if (e) {
      console.error('[Auth] login error:', e)
      setErreurGoogle(t('connexion.googleEchec'))
    }
  }

  async function seConnecterMotDePasse() {
    if (!adresse || !password || loading) return
    setLoading(true)
    setError(null)
    const { session, error: e, refuse } = await signInWithEmail(adresse, password)
    setLoading(false)
    if (session) {
      connecte()
      return
    }
    setError(refuse ? t('connexion.motDePasseFaux') : (e || t('connexion.codeErreur')))
  }

  // « Mot de passe oublié ? » : le lien de connexion par email connecte sans mot de passe.
  function oubli() {
    if (!adresse) {
      setError(t('connexion.oubliSansAdresse'))
      return
    }
    void continuer()
  }

  if (ecran === 'boite') {
    return (
      <RegardeTaBoite
        email={adresse}
        creation={creation}
        envoi={envoi.etat?.envoi ?? 'attente'}
        restant={envoi.restant(adresse)}
        attenteGoogle={versGoogle}
        erreurGoogle={erreurGoogle}
        onRenvoyer={() => void recevoirLien(creation, true)}
        onChanger={changer}
        onGoogle={() => void google()}
        onMotDePasse={versMotDePasse}
        onConnecte={connecte}
      />
    )
  }

  if (ecran === 'google') {
    return (
      <div className={C.racine} data-connexion-ecran="google">
        <h3 className={C.titre}>{t('connexion.googleTitre')}</h3>
        <p className={C.texte}>{t('connexion.googleTexte')}</p>
        <p className={C.texte}><strong className={C.fort}>{adresse}</strong></p>
        <BoutonGoogle attente={versGoogle} onClick={() => void google()} />
        {erreurGoogle && <p role="alert" className={C.erreur}>{erreurGoogle}</p>}
        <button type="button" className={C.lien} onClick={() => void recevoirLien()} disabled={versGoogle}>
          {t('connexion.googleAutreLien')}
        </button>
        <button type="button" className={C.lien} onClick={changer}>{t('connexion.changer')}</button>
        <Pied />
      </div>
    )
  }

  if (ecran === 'inconnue') {
    // Le Carnet est un produit d'appel : créer son compte est le geste principal.
    const parGoogle = suiteCreation(adresse) === 'google'
    return (
      <div className={C.racine} data-connexion-ecran="inconnue">
        <h3 className={C.titre}>{t('connexion.inconnueTitre')}</h3>
        <p className={C.texte}><strong className={C.fort}>{adresse}</strong></p>
        <p className={C.texte}>{t('connexion.inconnueGain')}</p>
        {parGoogle ? (
          <>
            <BoutonGoogle attente={versGoogle} onClick={() => void google()} libelle={t('connexion.inconnueCreerGoogle')} />
            {erreurGoogle && <p role="alert" className={C.erreur}>{erreurGoogle}</p>}
            <button type="button" className={C.lien} onClick={() => void recevoirLien(true)} disabled={versGoogle}>
              {t('connexion.inconnueAutreLien')}
            </button>
          </>
        ) : (
          <button type="button" className={C.principal} onClick={() => void recevoirLien(true)}>
            {t('connexion.inconnueCreer')}
          </button>
        )}
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={newsletter}
            onChange={e => setNewsletter(e.target.checked)}
            className="mt-0.5 rounded border-border accent-blue-500"
          />
          <span className="text-xs text-muted-foreground leading-relaxed">{t('connexion.newsletter')}</span>
        </label>
        <div className={`${C.encart} space-y-1.5`}>
          <p className={C.texte}>{t('connexion.inconnueDejaClient')}</p>
          <button type="button" className={C.lien} onClick={changer}>{t('connexion.inconnueEssayer')}</button>
        </div>
        <Pied />
      </div>
    )
  }

  if (ecran === 'rattachee') {
    return (
      <div className={C.racine} data-connexion-ecran="rattachee">
        <h3 className={C.titre}>{t('connexion.rattacheeTitre')}</h3>
        <p className={C.texte}>{t('connexion.rattacheeTexte')}</p>
        <button type="button" className={C.principal} onClick={changer}>{t('connexion.rattacheeAutre')}</button>
        <BoutonGoogle attente={versGoogle} onClick={() => void google(false)} />
        {erreurGoogle && <p role="alert" className={C.erreur}>{erreurGoogle}</p>}
        <Pied />
      </div>
    )
  }

  // Écran de l'adresse (et « Un instant... » pendant la reconnaissance).
  const verif = ecran === 'verif'
  return (
    <div className="space-y-4 px-1" data-connexion-ecran="adresse">
      {/* Logo */}
      <div className="flex flex-col items-center text-center pt-2 pb-1">
        <div className="w-12 h-12 rounded-2xl bg-yellow-400/10 border border-yellow-400/20 flex items-center justify-center text-xl mb-2">
          📚
        </div>
        <p className="text-xs text-muted-foreground">{t('connexion.accroche')}</p>
      </div>

      {/* Un champ, un bouton : le journal reconnaît l'adresse */}
      <form className="space-y-2.5" noValidate onSubmit={e => { e.preventDefault(); void continuer() }}>
        <input
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          placeholder={t('connexion.email')}
          value={email}
          onChange={e => setEmail(e.target.value)}
          readOnly={verif}
          className={C.input}
        />
        <button type="submit" disabled={verif || !adresse} className={C.principal}>
          {verif && <Loader2 size={14} className="animate-spin" />}
          {verif ? t('connexion.verification') : t('connexion.continuer')}
        </button>
        {error && <p role="alert" className={C.erreur}>{error}</p>}
      </form>

      {/* Ce que le compte apporte (nouveaux venus), et la règle des clients existants */}
      <div className="space-y-1.5 text-center">
        <p className="text-xs text-muted-foreground leading-relaxed">{t('connexion.nouveau')}</p>
        <p className="text-[11px] text-muted-foreground/80 leading-relaxed">{t('connexion.dejaClient')}</p>
      </div>

      {/* Le mot de passe, pour ceux qui en ont un : en lien secondaire */}
      {!motDePasse ? (
        <p className="text-center">
          <button
            type="button"
            onClick={() => setMotDePasse(true)}
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
          >
            {t('connexion.motDePasse')}
          </button>
        </p>
      ) : (
        <div className="space-y-2.5">
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground/70">{t('connexion.avecMotDePasse')}</span>
            <div className="flex-1 h-px bg-border" />
          </div>
          {/* L'email est le champ unique en haut */}
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              name="password"
              autoComplete="current-password"
              placeholder={t('connexion.motDePasseChamp')}
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && void seConnecterMotDePasse()}
              className={`${C.input} pr-9`}
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label={showPassword ? t('connexion.masquerMotDePasse') : t('connexion.afficherMotDePasse')}
            >
              {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          </div>
          <button
            type="button"
            onClick={() => void seConnecterMotDePasse()}
            disabled={loading || verif || !adresse || !password}
            className={C.secondaire}
          >
            {loading && <Loader2 size={13} className="animate-spin" />}
            {t('connexion.seConnecter')}
          </button>
          <div className="text-center space-y-1">
            <button
              type="button"
              onClick={oubli}
              disabled={loading || verif}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              {t('connexion.oubli')}
            </button>
            <p className="text-[11px] text-muted-foreground/70">{t('connexion.oubliAide')}</p>
          </div>
        </div>
      )}

      <p className="text-center text-[11px] text-muted-foreground/60">{t('connexion.compteUnique')}</p>
    </div>
  )
}

// ---------------------------------------------------------------- Regarde ta boîte

function RegardeTaBoite({
  email, creation, envoi, restant, attenteGoogle, erreurGoogle,
  onRenvoyer, onChanger, onGoogle, onMotDePasse, onConnecte,
}: {
  email: string
  /** Création de compte (porte « inconnue ») : le texte du lien le dit. */
  creation: boolean
  envoi: 'attente' | Envoi
  /** Secondes avant de pouvoir renvoyer (décompte de cette adresse). */
  restant: number
  attenteGoogle: boolean
  erreurGoogle: string | null
  onRenvoyer: () => void
  onChanger: () => void
  onGoogle: () => void
  /** Repli : retour au champ, le mot de passe ouvert. */
  onMotDePasse: () => void
  /** Session ouverte (lien cliqué dans l'email, ou code juste). */
  onConnecte: () => void
}) {
  const [code, setCode] = useState('')
  const [voirCode, setVoirCode] = useState(false)
  const [verif, setVerif] = useState<'repos' | 'attente' | IssueCode>('repos')

  // Une seule fois : le lien cliqué et le code juste préviennent tous deux.
  const fait = useRef(false)
  const surConnecte = useRef(onConnecte)
  useEffect(() => { surConnecte.current = onConnecte })
  const connecter = useCallback(() => {
    if (fait.current) return
    fait.current = true
    surConnecte.current()
  }, [])

  // Le lien de l'email : le service worker ouvre la session et l'écrit dans
  // chrome.storage.local ; l'écran la voit arriver (événement, pas de minuterie).
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.storage?.onChanged) return
    const surChangement = (changements: Record<string, chrome.storage.StorageChange>, zone: string) => {
      if (zone === 'local' && changements[CLE_SESSION_CARNET]?.newValue) connecter()
    }
    chrome.storage.onChanged.addListener(surChangement)
    return () => chrome.storage.onChanged.removeListener(surChangement)
  }, [connecter])

  const issue = envoi === 'attente' ? null : envoi
  const parti = issue !== null && (issue.t === 'ok' || issue.t === 'delai')
  const voie = issue && (issue.t === 'ok' || issue.t === 'delai') ? issue.voie : null
  // Le code est-il sûrement dans l'email (route du journal, ou modèles Supabase à jour) ?
  const codeSur = voie ? codeSurDansEmail(voie) : true
  const gmail = estGmail(email)

  async function valider(c: string) {
    if (c.length !== LONGUEUR_CODE || verif === 'attente' || fait.current) return
    setVerif('attente')
    const r = await verifierCode(email, c)
    setVerif(r)
    if (r.t === 'ok') connecter()
  }

  function saisir(v: string) {
    const c = codeSaisi(v)
    setCode(c)
    if (verif !== 'attente') setVerif('repos')
    if (c.length === LONGUEUR_CODE) void valider(c)
  }

  function renvoyer() {
    setCode('')
    setVerif('repos')
    onRenvoyer()
  }

  const titre = !issue || parti
    ? t('connexion.boiteTitre')
    : issue.t === 'plafond' ? t('connexion.titrePlafond') : t('connexion.titreErreur')
  const ok = typeof verif === 'object' && verif.t === 'ok'
  const refus = typeof verif === 'object' && verif.t !== 'ok' ? verif.t : null

  return (
    <div className={C.racine} data-connexion-ecran="boite">
      <h3 className={C.titre}>{titre}</h3>

      {envoi === 'attente' && (
        <p className={`${C.texte} flex items-center gap-1.5`} aria-live="polite">
          <Loader2 size={12} className="animate-spin" /> {t('connexion.boiteAttente')}
        </p>
      )}

      {issue && parti && (
        <>
          <p className={C.texte} aria-live="polite">
            {issue.t === 'ok'
              ? <>{t('connexion.boiteEnvoye')} <strong className={C.fort}>{email}</strong>.</>
              : restant > 0 ? t('connexion.boiteDejaParti', { n: restant }) : t('connexion.boiteDejaPartiFini')}
          </p>
          <p className={C.texte}>
            {voie === 'aok'
              ? t('connexion.boiteAttenduAok', { support: SUPPORT, sujet: SUJET_AOK })
              : t('connexion.boiteAttenduSupabase', { sujet: SUJET_SUPABASE_LIEN, sujetInscription: SUJET_SUPABASE_INSCRIPTION })}
          </p>

          {/* La voie principale : le lien de l'email */}
          {voie === 'aok' ? (
            <div className={C.encart} data-connexion-lien="principal">
              <p className="text-xs text-foreground leading-relaxed">
                {t(creation ? 'connexion.lienCreation' : 'connexion.lienPrincipal')}
              </p>
              <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground" aria-live="polite">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" aria-hidden="true" />
                {t('connexion.lienAttente')}
              </p>
            </div>
          ) : (
            // Repli (email de Supabase) : son lien ne revient au Carnet qu'une fois la page de
            // retour du journal dans les Redirect URLs de Supabase. Google et le mot de passe à côté.
            <>
              <p className={C.texte}>{t('connexion.repliLien')}</p>
              <BoutonGoogle attente={attenteGoogle} onClick={onGoogle} />
              {erreurGoogle && <p role="alert" className={C.erreur}>{erreurGoogle}</p>}
              <button type="button" className={C.lien} onClick={onMotDePasse}>{t('connexion.motDePasse')}</button>
            </>
          )}

          {/* La voie secondaire : le code à 6 chiffres, à un clic */}
          {codeSur && (!voirCode ? (
            <button type="button" className={C.lien} onClick={() => setVoirCode(true)}>{t('connexion.codeAutre')}</button>
          ) : (
            <form className="space-y-2.5" onSubmit={e => { e.preventDefault(); void valider(code) }}>
              <label htmlFor="connexion-code" className={C.label}>{t('connexion.codeLabel')}</label>
              <input
                id="connexion-code"
                className={`${C.input} ${C.code}`}
                inputMode="numeric"
                autoComplete="one-time-code"
                enterKeyHint="go"
                placeholder="000000"
                value={code}
                onChange={e => saisir(e.target.value)}
                disabled={verif === 'attente' || ok}
                autoFocus
              />
              <button type="submit" className={C.secondaire} disabled={code.length !== LONGUEUR_CODE || verif === 'attente' || ok}>
                {verif === 'attente'
                  ? <><Loader2 size={14} className="animate-spin" /> {t('connexion.verificationCode')}</>
                  : t('connexion.valider')}
              </button>
              {refus && (
                <p role="alert" className={C.erreur}>
                  {t(refus === 'faux' ? 'connexion.codeFaux' : refus === 'trop' ? 'connexion.codeTrop' : 'connexion.codeErreur')}
                </p>
              )}
              {ok && <p className={C.ok}>{t('connexion.connecte')}</p>}
            </form>
          ))}
          <p className={C.texte}>{t('connexion.dernier')}</p>
        </>
      )}

      {issue?.t === 'plafond' && (
        <>
          <p role="alert" className={C.erreur}>
            {t('connexion.plafond')}{gmail ? ` ${t('connexion.plafondGmail')}` : ''}
          </p>
          {gmail && <BoutonGoogle attente={attenteGoogle} onClick={onGoogle} />}
          {gmail && erreurGoogle && <p role="alert" className={C.erreur}>{erreurGoogle}</p>}
          <button type="button" className={gmail ? C.secondaire : C.principal} onClick={ecrireAuSupport}>
            {t('connexion.ecrisNousBouton')}
          </button>
        </>
      )}

      {issue?.t === 'erreur' && (
        <p role="alert" className={C.erreur}>
          {issue.message === 'invalide' ? t('connexion.adresseInvalide') : t('connexion.erreurEnvoi')}
        </p>
      )}

      {issue && (
        <button
          type="button"
          className={issue.t === 'plafond' ? C.lien : C.secondaire}
          disabled={restant > 0}
          onClick={renvoyer}
        >
          {restant > 0 ? t('connexion.renvoiDans', { n: restant }) : t('connexion.renvoyer')}
        </button>
      )}
      {gmail && voie === 'aok' && issue && issue.t !== 'plafond' && (
        <>
          <button type="button" className={C.lien} onClick={onGoogle} disabled={attenteGoogle}>{t('connexion.googleGmail')}</button>
          {erreurGoogle && <p role="alert" className={C.erreur}>{erreurGoogle}</p>}
        </>
      )}
      <button type="button" className={C.lien} onClick={onChanger}>{t('connexion.changer')}</button>

      {issue?.t !== 'plafond' && <Pied />}
    </div>
  )
}

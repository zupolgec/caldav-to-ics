export type Locale = "it" | "en";
export const LOCALES: Locale[] = ["it", "en"];

const it = {
  meta: {
    title: "Calendario: tutti i tuoi calendari in un solo link",
    description:
      "Unisci Google Calendar, iCloud, Outlook e i calendari CalDAV in un unico link da condividere, completo o solo con gli orari in cui sei occupato.",
  },
  nav: {
    calendars: "Calendari",
    settings: "Impostazioni",
    signIn: "Accedi",
    signOut: "Esci",
    language: "Lingua",
  },
  landing: {
    title: "Tutti i tuoi calendari, un solo link da condividere.",
    lead: "Unisci Google, iCloud, Outlook e ogni calendario che ha un link. Chi lo riceve vede i tuoi impegni, oppure solo quando sei occupato: decidi tu.",
    emailNote: "Niente password: ti mandiamo un link per entrare. È gratis.",
    demo: {
      label: "Esempio: tre calendari uniti in un link completo e in uno che mostra solo quando sei occupato",
      sources: ["Lavoro", "Personale", "Famiglia"],
      full: "Link completo",
      busy: "Link occupato",
      days: ["lun", "mar", "mer", "gio", "ven", "sab", "dom"],
      events: ["Riunione", "Dentista", "Calcetto", "Cena", "Volo"],
      busyTitle: "Occupato",
    },
    howTitle: "Come funziona",
    steps: [
      { title: "Incolla i link dei tuoi calendari", text: "Ogni app di calendario ha un link segreto in formato iCal. Ti mostriamo dove trovarlo." },
      { title: "Ricevi due link", text: "Uno con tutti i dettagli degli eventi, l'altro che mostra solo quando sei occupato." },
      { title: "Condividili con chi vuoi", text: "Partner, assistente, colleghi o un'altra app: si abbonano una volta e restano aggiornati." },
    ],
    privacyTitle: "Due link, due livelli di dettaglio",
    privacyText: "Lo stesso impegno, visto da chi ha il link completo e da chi ha il link occupato.",
    sampleEvent: { title: "Revisione contratto con Studio Rossi", place: "Via Roma 12, Milano", people: "3 partecipanti", time: "gio 10:00–11:30" },
    keeps: "Il link occupato conserva",
    keepsList: ["giorno, ora d'inizio e di fine", "ricorrenze ed eccezioni"],
    hides: "e toglie",
    hidesList: ["titolo, descrizione e luogo", "partecipanti e organizzatore", "promemoria, allegati e link"],
    skips: "Non mostra gli eventi segnati come liberi, quelli annullati e gli inviti che hai rifiutato.",
    worksTitle: "Funziona con",
    works: ["Google Calendar", "Apple iCloud", "Outlook e Microsoft 365", "Fastmail", "Nextcloud", "Forward Email", "Qualsiasi link .ics o webcal"],
    worksNote: "Per i calendari CalDAV basta indirizzo, utente e password.",
    faqTitle: "Domande frequenti",
    faq: [
      {
        q: "Ogni quanto si aggiorna?",
        a: "Rileggiamo i tuoi calendari ogni 10 minuti. Poi dipende dall'app di chi si abbona: Google Calendar, per esempio, aggiorna i calendari esterni ogni qualche ora.",
      },
      {
        q: "Chi può vedere i miei calendari?",
        a: "Solo chi ha uno dei tuoi link. Sono lunghi e impossibili da indovinare. Se uno finisce nelle mani sbagliate, dalle impostazioni lo sostituisci con uno nuovo e il vecchio smette subito di funzionare.",
      },
      {
        q: "Come custodite i link e le password dei miei calendari?",
        a: "Sono cifrati nel database e non li mostriamo mai per intero, nemmeno a te.",
      },
      {
        q: "Quali eventi includete?",
        a: "Gli ultimi 90 giorni e tutto il futuro, ricorrenze comprese. Puoi cambiare quanti giorni passati includere nelle impostazioni.",
      },
      {
        q: "Quanto costa?",
        a: "Niente. Il progetto è open source: se preferisci, puoi installarlo sul tuo account Cloudflare.",
      },
    ],
    source: "Codice sorgente su GitHub",
  },
  auth: {
    email: "La tua email",
    emailPlaceholder: "nome@esempio.it",
    send: "Ricevi il link di accesso",
    loginTitle: "Accedi o registrati",
    loginText: "Inserisci la tua email: ti mandiamo un link per entrare. Se non hai ancora un account, lo creiamo al primo accesso.",
    sentTitle: "Controlla la posta",
    sentText: (email: string) => `Ti abbiamo mandato un link per entrare a ${email}. Vale 20 minuti e si usa una volta sola.`,
    sentHint: "Non è arrivato? Controlla lo spam o richiedine un altro.",
    again: "Richiedi un altro link",
    verifyTitle: "Entra nel tuo account",
    verifyText: (email: string) => `Stai entrando come ${email}.`,
    enter: "Entra",
    invalidTitle: "Questo link non vale più",
    invalidText: "I link di accesso valgono 20 minuti e si usano una volta sola. Richiedine uno nuovo.",
    errors: {
      email: "Controlla l'indirizzo email: sembra incompleto.",
      tooMany: "Hai chiesto troppi link in poco tempo. Riprova tra un'ora.",
      send: "Non siamo riusciti a mandare l'email. Riprova tra qualche minuto.",
    },
    mail: {
      subject: "Il tuo link di accesso a Calendario",
      greeting: "Ciao,",
      body: "usa questo link per entrare in Calendario:",
      button: "Entra in Calendario",
      validity: "Vale 20 minuti e si usa una volta sola. Se non l'hai chiesto tu, ignora questa email.",
    },
  },
  dashboard: {
    title: "I tuoi calendari",
    intro: "Incolla il link segreto in formato iCal di ogni calendario: li uniamo in un unico calendario.",
    help: "Dove trovo il link?",
    url: "Link del calendario",
    urlPlaceholder: "https://… oppure webcal://…",
    needsLogin: "Serve utente e password?",
    username: "Utente",
    password: "Password",
    loginHint: "Per i calendari CalDAV come Forward Email, Fastmail o Nextcloud. Se il servizio lo permette, usa una password creata apposta per le app.",
    add: "Aggiungi calendario",
    adding: "Aggiungo…",
    emptyTitle: "Aggiungi il tuo primo calendario",
    emptyText: "Appena lo aggiungi, i tuoi link iniziano a mostrare i suoi eventi.",
    events: (n: number) => (n === 1 ? "1 evento" : `${n.toLocaleString("it-IT")} eventi`),
    updated: (when: string) => `aggiornato ${when}`,
    failing: (when: string) => `Non risponde da ${when}: usiamo l'ultima copia ricevuta.`,
    failingNever: "Non risponde: lo riproviamo a ogni aggiornamento.",
    remove: "Rimuovi",
    removeConfirm: (label: string) => `Rimuovere ${label}? I suoi eventi spariranno dai tuoi link.`,
    added: (label: string) => `Calendario aggiunto: ${label}.`,
    removed: "Calendario rimosso.",
    limit: (n: number) => `Puoi unire al massimo ${n} calendari.`,
    duplicate: "Hai già aggiunto questo calendario.",
    linksTitle: "I tuoi link",
    linksIntro: "Chi si abbona a questi link vede i tuoi calendari uniti e resta aggiornato.",
    full: "Calendario completo",
    fullHint: "Tutti gli eventi con titoli, luoghi e note. Tienilo per te e per chi si fida.",
    busy: "Calendario occupato",
    busyHint: (title: string) => `Solo quando sei occupato: ogni evento diventa “${title}”, senza dettagli.`,
    copy: "Copia",
    copied: "Copiato",
    openIn: "Abbonati con",
    status: (when: string, events: string, days: number) => `Aggiornato ${when}: ${events} dagli ultimi ${days} giorni in poi.`,
    pending: "Stiamo preparando i tuoi link: ci vuole qualche secondo.",
    noSources: "I link funzionano già: mostreranno gli eventi appena aggiungi un calendario.",
    sourceErrors: {
      invalid_url: "Questo non sembra un link: deve iniziare con https:// o webcal://.",
      not_ics: "A questo link non c'è un calendario. Serve il link in formato iCal (.ics), non quello della pagina web.",
      not_found: "Il calendario non è stato trovato: il link potrebbe essere scaduto o incompleto.",
      unauthorized: "Il calendario ha rifiutato l'accesso: controlla utente e password.",
      http: "Il server del calendario ha risposto con un errore. Riprova tra poco.",
      too_large: "Il calendario è troppo grande: il limite è 20 MB.",
      timeout: "Il server del calendario non ha risposto in tempo. Riprova tra poco.",
      network: "Non riusciamo a raggiungere il server del calendario. Controlla il link.",
      no_calendars: "A questo indirizzo non ci sono calendari con eventi.",
    },
  },
  helpDialog: {
    title: "Dove trovo il link del calendario?",
    intro: "Serve il link segreto in formato iCal: di solito finisce in .ics o inizia con webcal://.",
    close: "Chiudi",
    providers: [
      {
        name: "Google Calendar",
        steps: [
          "Apri Google Calendar dal computer.",
          "Nella colonna a sinistra passa sul calendario, clicca i tre puntini e scegli Impostazioni e condivisione.",
          "Scorri fino a Integra calendario e copia l'Indirizzo segreto in formato iCal.",
        ],
        note: "Non lo trovi? Negli account di lavoro può averlo disattivato l'amministratore.",
      },
      {
        name: "Apple iCloud",
        steps: [
          "Su iPhone apri Calendario e tocca Calendari.",
          "Tocca la i accanto al calendario e attiva Calendario pubblico.",
          "Tocca Condividi link e copialo.",
        ],
        note: "Su Mac: clic destro sul calendario, poi Impostazioni di condivisione e Calendario pubblico.",
      },
      {
        name: "Outlook e Microsoft 365",
        steps: [
          "Apri Outlook sul web e vai in Impostazioni, Calendario, Calendari condivisi.",
          "In Pubblica un calendario scegli il calendario e Può visualizzare tutti i dettagli.",
          "Clicca Pubblica e copia il link ICS.",
        ],
      },
      {
        name: "Fastmail",
        steps: [
          "Vai in Impostazioni, Calendari e clicca Modifica e condividi sul calendario.",
          "Attiva la condivisione con il mondo e scegli Tutti i dettagli degli eventi.",
          "Copia il link iCal.",
        ],
      },
      {
        name: "CalDAV: Forward Email, Nextcloud e altri",
        steps: [
          "Incolla l'indirizzo CalDAV del servizio, per esempio https://caldav.forwardemail.net.",
          "Apri Serve utente e password? e inserisci il tuo utente e una password per le app.",
          "Se l'indirizzo è quello dell'account, aggiungiamo tutti i suoi calendari di eventi.",
        ],
      },
      {
        name: "Altri calendari",
        steps: ["Va bene qualsiasi link .ics o webcal://: calendari sportivi, festività, eventi."],
      },
    ],
  },
  settings: {
    title: "Impostazioni",
    calendarSection: "Il tuo calendario",
    calendarName: "Nome del calendario",
    calendarNameHint: "Lo vede chi si abbona ai tuoi link.",
    busyTitle: "Titolo degli eventi occupati",
    pastDays: "Giorni passati da includere",
    pastDaysHint: "Gli eventi futuri ci sono sempre tutti.",
    extraEmails: "Altri tuoi indirizzi email",
    extraEmailsHint:
      "Separali con una virgola. Gli inviti che hai rifiutato con questi indirizzi non compaiono nel calendario occupato. Il tuo indirizzo di accesso e quelli dei calendari collegati li riconosciamo già.",
    save: "Salva",
    saved: "Salvato.",
    invalid: "Controlla i campi evidenziati.",
    linksSection: "Sostituisci i link",
    linksText:
      "Crea un nuovo link se quello vecchio è finito nelle mani sbagliate. Il vecchio smette subito di funzionare: chi era abbonato dovrà usare quello nuovo.",
    rotateFull: "Nuovo link completo",
    rotateBusy: "Nuovo link occupato",
    rotateConfirm: "Il link attuale smetterà di funzionare per tutti. Continuare?",
    rotated: "Fatto: ecco il nuovo link nella pagina dei calendari.",
    accountSection: "Account",
    signedInAs: (email: string) => `Sei entrato come ${email}.`,
    deleteTitle: "Elimina account",
    deleteText: "Cancella l'account, i calendari collegati e i tuoi link. Non si può annullare.",
    deleteConfirm: "Scrivi la tua email per confermare",
    deleteButton: "Elimina account",
    deleteMismatch: "L'email non corrisponde a quella del tuo account.",
  },
  defaults: {
    calendarName: "Il mio calendario",
    busyTitle: "Occupato",
  },
  notFound: {
    title: "Pagina non trovata",
    text: "Il link che hai seguito non porta da nessuna parte.",
    home: "Torna all'inizio",
  },
};

export type Messages = typeof it;

const en: Messages = {
  meta: {
    title: "Calendario: all your calendars in one link",
    description:
      "Merge Google Calendar, iCloud, Outlook and CalDAV calendars into one link to share, with every detail or only the times you're busy.",
  },
  nav: {
    calendars: "Calendars",
    settings: "Settings",
    signIn: "Sign in",
    signOut: "Sign out",
    language: "Language",
  },
  landing: {
    title: "All your calendars, one link to share.",
    lead: "Merge Google, iCloud, Outlook and any calendar that has a link. Whoever gets it sees your plans, or only when you're busy: you choose.",
    emailNote: "No password: we email you a link to sign in. It's free.",
    demo: {
      label: "Example: three calendars merged into a full link and a link that only shows when you're busy",
      sources: ["Work", "Personal", "Family"],
      full: "Full link",
      busy: "Busy link",
      days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      events: ["Meeting", "Dentist", "Football", "Dinner", "Flight"],
      busyTitle: "Busy",
    },
    howTitle: "How it works",
    steps: [
      { title: "Paste your calendar links", text: "Every calendar app has a secret link in iCal format. We show you where to find it." },
      { title: "Get two links", text: "One with every event detail, one that only shows when you're busy." },
      { title: "Share them with anyone", text: "Partner, assistant, coworkers or another app: they subscribe once and stay up to date." },
    ],
    privacyTitle: "Two links, two levels of detail",
    privacyText: "The same event, seen with the full link and with the busy link.",
    sampleEvent: { title: "Contract review with Rossi & Partners", place: "12 Via Roma, Milan", people: "3 guests", time: "Thu 10:00–11:30" },
    keeps: "The busy link keeps",
    keepsList: ["the day, start and end time", "repeats and exceptions"],
    hides: "and removes",
    hidesList: ["title, description and location", "guests and organizer", "reminders, attachments and links"],
    skips: "It leaves out events marked as free, cancelled events and invitations you declined.",
    worksTitle: "Works with",
    works: ["Google Calendar", "Apple iCloud", "Outlook and Microsoft 365", "Fastmail", "Nextcloud", "Forward Email", "Any .ics or webcal link"],
    worksNote: "For CalDAV calendars, all you need is the address, a username and a password.",
    faqTitle: "Questions",
    faq: [
      {
        q: "How often does it update?",
        a: "We read your calendars again every 10 minutes. After that it's up to the subscriber's app: Google Calendar, for example, refreshes external calendars every few hours.",
      },
      {
        q: "Who can see my calendars?",
        a: "Only people who have one of your links. They're long and impossible to guess. If one ends up in the wrong hands, replace it from the settings and the old one stops working at once.",
      },
      {
        q: "How do you keep my calendar links and passwords?",
        a: "They're encrypted in the database and never shown in full, not even to you.",
      },
      {
        q: "Which events are included?",
        a: "The last 90 days and everything ahead, repeating events included. You can change how many past days to include in the settings.",
      },
      {
        q: "How much does it cost?",
        a: "Nothing. The project is open source: if you prefer, you can run it on your own Cloudflare account.",
      },
    ],
    source: "Source code on GitHub",
  },
  auth: {
    email: "Your email",
    emailPlaceholder: "name@example.com",
    send: "Email me a sign-in link",
    loginTitle: "Sign in or sign up",
    loginText: "Enter your email and we'll send you a link to sign in. If you don't have an account yet, we'll create it the first time.",
    sentTitle: "Check your email",
    sentText: (email: string) => `We sent a sign-in link to ${email}. It works for 20 minutes and only once.`,
    sentHint: "Didn't get it? Check your spam folder or ask for another one.",
    again: "Send another link",
    verifyTitle: "Sign in to your account",
    verifyText: (email: string) => `You're signing in as ${email}.`,
    enter: "Sign in",
    invalidTitle: "This link no longer works",
    invalidText: "Sign-in links work for 20 minutes and only once. Ask for a new one.",
    errors: {
      email: "Check the email address: it looks incomplete.",
      tooMany: "You asked for too many links in a short time. Try again in an hour.",
      send: "We couldn't send the email. Try again in a few minutes.",
    },
    mail: {
      subject: "Your sign-in link for Calendario",
      greeting: "Hi,",
      body: "use this link to sign in to Calendario:",
      button: "Sign in to Calendario",
      validity: "It works for 20 minutes and only once. If you didn't ask for it, ignore this email.",
    },
  },
  dashboard: {
    title: "Your calendars",
    intro: "Paste the secret iCal link of each calendar and we'll merge them into one.",
    help: "Where do I find the link?",
    url: "Calendar link",
    urlPlaceholder: "https://… or webcal://…",
    needsLogin: "Needs a username and password?",
    username: "Username",
    password: "Password",
    loginHint: "For CalDAV calendars such as Forward Email, Fastmail or Nextcloud. If the service offers it, use an app password.",
    add: "Add calendar",
    adding: "Adding…",
    emptyTitle: "Add your first calendar",
    emptyText: "As soon as you add it, your links start showing its events.",
    events: (n: number) => (n === 1 ? "1 event" : `${n.toLocaleString("en-US")} events`),
    updated: (when: string) => `updated ${when}`,
    failing: (when: string) => `Not responding since ${when}: we're using the last copy we received.`,
    failingNever: "Not responding: we try again at every update.",
    remove: "Remove",
    removeConfirm: (label: string) => `Remove ${label}? Its events will disappear from your links.`,
    added: (label: string) => `Calendar added: ${label}.`,
    removed: "Calendar removed.",
    limit: (n: number) => `You can merge up to ${n} calendars.`,
    duplicate: "You've already added this calendar.",
    linksTitle: "Your links",
    linksIntro: "Whoever subscribes to these links sees your merged calendars and stays up to date.",
    full: "Full calendar",
    fullHint: "Every event with titles, places and notes. Keep it for yourself and people you trust.",
    busy: "Busy calendar",
    busyHint: (title: string) => `Only when you're busy: every event becomes “${title}”, with no details.`,
    copy: "Copy",
    copied: "Copied",
    openIn: "Subscribe with",
    status: (when: string, events: string, days: number) => `Updated ${when}: ${events} from the last ${days} days onwards.`,
    pending: "We're getting your links ready: it takes a few seconds.",
    noSources: "Your links already work: they'll show events as soon as you add a calendar.",
    sourceErrors: {
      invalid_url: "This doesn't look like a link: it must start with https:// or webcal://.",
      not_ics: "This link isn't a calendar. You need the iCal (.ics) link, not the web page.",
      not_found: "The calendar couldn't be found: the link may be expired or incomplete.",
      unauthorized: "The calendar refused access: check the username and password.",
      http: "The calendar server answered with an error. Try again in a moment.",
      too_large: "The calendar is too large: the limit is 20 MB.",
      timeout: "The calendar server didn't answer in time. Try again in a moment.",
      network: "We can't reach the calendar server. Check the link.",
      no_calendars: "There are no event calendars at this address.",
    },
  },
  helpDialog: {
    title: "Where do I find the calendar link?",
    intro: "You need the secret link in iCal format: it usually ends in .ics or starts with webcal://.",
    close: "Close",
    providers: [
      {
        name: "Google Calendar",
        steps: [
          "Open Google Calendar on a computer.",
          "In the left column, hover over the calendar, click the three dots and choose Settings and sharing.",
          "Scroll to Integrate calendar and copy the Secret address in iCal format.",
        ],
        note: "Can't find it? On work accounts, your administrator may have turned it off.",
      },
      {
        name: "Apple iCloud",
        steps: ["On iPhone, open Calendar and tap Calendars.", "Tap the i next to the calendar and turn on Public Calendar.", "Tap Share Link and copy it."],
        note: "On Mac: right-click the calendar, then Sharing Settings and Public Calendar.",
      },
      {
        name: "Outlook and Microsoft 365",
        steps: [
          "Open Outlook on the web and go to Settings, Calendar, Shared calendars.",
          "Under Publish a calendar, pick the calendar and Can view all details.",
          "Click Publish and copy the ICS link.",
        ],
      },
      {
        name: "Fastmail",
        steps: [
          "Go to Settings, Calendars and click Edit & share on the calendar.",
          "Turn on sharing with the world and choose All event details.",
          "Copy the iCal link.",
        ],
      },
      {
        name: "CalDAV: Forward Email, Nextcloud and others",
        steps: [
          "Paste the service's CalDAV address, for example https://caldav.forwardemail.net.",
          "Open Needs a username and password? and enter your username and an app password.",
          "If the address is the account's, we add all of its event calendars.",
        ],
      },
      {
        name: "Other calendars",
        steps: ["Any .ics or webcal:// link works: sports, holidays, events."],
      },
    ],
  },
  settings: {
    title: "Settings",
    calendarSection: "Your calendar",
    calendarName: "Calendar name",
    calendarNameHint: "People who subscribe to your links see it.",
    busyTitle: "Title of busy events",
    pastDays: "Past days to include",
    pastDaysHint: "Future events are always all included.",
    extraEmails: "Your other email addresses",
    extraEmailsHint:
      "Separate them with commas. Invitations you declined with these addresses don't appear in the busy calendar. We already recognize your sign-in address and the ones of your connected calendars.",
    save: "Save",
    saved: "Saved.",
    invalid: "Check the highlighted fields.",
    linksSection: "Replace your links",
    linksText:
      "Create a new link if the old one ended up in the wrong hands. The old one stops working at once: subscribers will need the new one.",
    rotateFull: "New full link",
    rotateBusy: "New busy link",
    rotateConfirm: "The current link will stop working for everyone. Continue?",
    rotated: "Done: the new link is on the calendars page.",
    accountSection: "Account",
    signedInAs: (email: string) => `You're signed in as ${email}.`,
    deleteTitle: "Delete account",
    deleteText: "Deletes your account, connected calendars and links. This can't be undone.",
    deleteConfirm: "Type your email to confirm",
    deleteButton: "Delete account",
    deleteMismatch: "That email doesn't match your account.",
  },
  defaults: {
    calendarName: "My calendar",
    busyTitle: "Busy",
  },
  notFound: {
    title: "Page not found",
    text: "The link you followed doesn't lead anywhere.",
    home: "Back to the start",
  },
};

const messages: Record<Locale, Messages> = { it, en };

export function t(locale: Locale): Messages {
  return messages[locale];
}

export function isLocale(value: unknown): value is Locale {
  return value === "it" || value === "en";
}

/** Picks Italian or English from an Accept-Language header; English is the fallback. */
export function negotiateLocale(header: string | null | undefined): Locale {
  const ranked = (header ?? "")
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { lang: tag.slice(0, 2).toLowerCase(), q: q ? Number(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);
  return ranked.find((r) => isLocale(r.lang))?.lang as Locale | undefined ?? "en";
}

/** "3 minutes ago" / "3 minuti fa". */
export function relativeTime(locale: Locale, from: number, now: number): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const seconds = Math.round((from - now) / 1000);
  if (Math.abs(seconds) < 60) return locale === "it" ? "adesso" : "just now";
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return rtf.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, "hour");
  return rtf.format(Math.round(hours / 24), "day");
}

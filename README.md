# Αποθήκη Δεμάτων — ΚΤΕΛ Αγρινίου

Εφαρμογή (PWA) για την Αποθήκη Ασυνοδεύτων του σταθμού Αγρινίου: καταχώρηση εισερχόμενων δεμάτων,
ράφι από επώνυμο, ειδοποίηση με WhatsApp/Viber/SMS, παράδοση με υπογραφή, μεταφορτώσεις, δρομολόγια.

- Εφαρμογή: https://apothikiktelagriniou-code.github.io/apothiki-dematon/
- Βάση: Supabase (Frankfurt). Δομή στο `supabase/migrations/`.
- Κώδικας: `src/` (Vite, JavaScript). Χτίσιμο: `npm run build` → φάκελος `docs/` (σερβίρεται από GitHub Pages).
- Έλεγχοι λογικής: `npm test`.

Στον κώδικα υπάρχει μόνο το δημόσιο (publishable) κλειδί του Supabase. Τα δεδομένα προστατεύονται με
Row Level Security: χωρίς σύνδεση χρήστη δεν διαβάζεται τίποτα. Μυστικά κλειδιά δεν μπαίνουν ποτέ εδώ.

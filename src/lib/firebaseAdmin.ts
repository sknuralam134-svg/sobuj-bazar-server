import admin from 'firebase-admin'

let initialized = false

function initFirebaseAdmin() {
  if (initialized) return
  if (admin.apps.length) {
    initialized = true
    return
  }

  const projectId = process.env.FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  let privateKey = process.env.FIREBASE_PRIVATE_KEY

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Firebase Admin কনফিগ নেই। FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY সেট করুন।',
    )
  }

  // Render/env often stores newlines as \n
  privateKey = privateKey.replace(/\\n/g, '\n')

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  })
  initialized = true
}

/** Used for phone / Google ID token verification only (not push). */
export async function verifyFirebaseIdToken(idToken: string) {
  initFirebaseAdmin()
  return admin.auth().verifyIdToken(idToken)
}

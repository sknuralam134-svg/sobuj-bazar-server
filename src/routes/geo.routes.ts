import { Router } from 'express'
import { msg } from '../lib/i18n'

const router = Router()

/**
 * GET /geo/reverse?lat=24.03&lng=88.12
 * Server-side reverse geocode via OpenStreetMap Nominatim
 * (avoids browser CORS / User-Agent issues).
 */
router.get('/reverse', async (req, res) => {
  const lat = Number(req.query.lat)
  const lng = Number(req.query.lng)

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: msg(req, 'geo.latLngRequired') })
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return res.status(400).json({ error: msg(req, 'geo.invalidCoords') })
  }

  try {
    const url =
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`

    const upstream = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'SobujBazar/1.0 (https://github.com/sknuralam134-svg/sobuj-bazar-server; delivery address)',
      },
    })

    if (!upstream.ok) {
      return res.status(502).json({ error: msg(req, 'geo.addressLookupFailed') })
    }

    const data: any = await upstream.json()

    let address: string | null = null
    if (data?.display_name && typeof data.display_name === 'string') {
      address = data.display_name
    } else if (data?.address) {
      const a = data.address
      const parts = [
        a.house_number,
        a.road,
        a.neighbourhood || a.suburb || a.village || a.hamlet,
        a.city || a.town || a.county,
        a.state,
        a.postcode,
      ].filter(Boolean)
      address = parts.length ? parts.join(', ') : null
    }

    if (!address) {
      return res.status(404).json({ error: msg(req, 'geo.addressNotFound') })
    }

    return res.json({ address, lat, lng })
  } catch (err) {
    console.error('[geo/reverse]', err)
    return res.status(502).json({ error: msg(req, 'geo.serviceDown') })
  }
})

export default router

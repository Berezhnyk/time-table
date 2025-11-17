import { defineStore } from 'pinia'
import axios from 'axios'
import { resolveTransportKey } from '../utils/transport'

const STOP_LIST_URL =
  import.meta.env.VITE_STOPS_API_URL ||
  (import.meta.env.DEV
    ? '/pid-stops/stops/json/stops.json'
    : 'https://data.pid.cz/stops/json/stops.json')

const GOLEMIO_BASE_URL =
  import.meta.env.VITE_GOLEMIO_API_URL ||
  (import.meta.env.DEV ? '/golemio/v2/pid' : 'https://api.golemio.cz/v2/pid')
const GOLEMIO_TOKEN = import.meta.env.VITE_GOLEMIO_API_KEY || ''

const normalizeStopGroups = (groups = []) =>
  groups
    .map((group) => {
      if (!group?.stops?.length) {
        return null
      }

      const representative = group.stops.find((stop) => stop?.lat && stop?.lon)
      if (!representative) {
        return null
      }

      const lat = group.avgLat || representative.lat
      const lon = group.avgLon || representative.lon

      return {
        node: group.node,
        cisId: group.cis || null,
        groupName: group.name,
        altName: group.fullName || group.uniqueName || group.name,
        municipality: group.municipality || null,
        trafficType: representative.mainTrafficType || group.mainTrafficType || null,
        transportKey: resolveTransportKey({
          trafficType: representative.mainTrafficType || group.mainTrafficType,
        }),
        lat,
        lon,
        centroid: { lat, lon },
        lines: group.stops.flatMap((stop) => stop.lines || []),
        stopIds: group.stops.map((stop) => stop.id),
        displayName: group.name,
        zone: group.stops[0]?.zone || null,
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.groupName.localeCompare(b.groupName, 'cs', { sensitivity: 'base' }))

const toMinutesFromNow = (timestamp) => {
  if (!timestamp) return null
  const target = new Date(timestamp)
  const now = new Date()
  if (Number.isNaN(target.getTime())) return null
  const diff = Math.round((target.getTime() - now.getTime()) / 60000)
  return diff
}

const selectTimestamp = (timeObj) => {
  if (!timeObj) return null
  if (typeof timeObj === 'string') return timeObj
  return (
    timeObj.predicted ||
    timeObj.schedule ||
    timeObj.scheduled ||
    timeObj.real ||
    timeObj.planned ||
    timeObj.departureTime ||
    timeObj.departure ||
    null
  )
}

const normalizeDeparture = (raw, fallbackPlatform = '') => {
  if (!raw) {
    return null
  }

  const departureTimestamp = raw.departure_timestamp || raw.departure_time || {}
  const planned =
    selectTimestamp(departureTimestamp) ||
    raw.departure_timestamp?.planned ||
    raw.departure_time?.scheduled ||
    raw.plannedDeparture ||
    raw.departure ||
    null

  const realtime =
    departureTimestamp.predicted ||
    departureTimestamp.real ||
    raw.departure_timestamp?.predicted ||
    raw.departure_timestamp?.real ||
    raw.departure_time?.real ||
    raw.actualDeparture ||
    null

  const destination =
    raw.trip?.headsign ||
    raw.headsign ||
    raw.direction ||
    raw.route?.long_name ||
    raw.route?.name ||
    '—'

  const line =
    raw.route?.short_name ||
    raw.route?.name ||
    raw.trip?.line?.name ||
    raw.line?.name ||
    '—'

  const platform =
    raw.stop?.platform_code ||
    raw.platform ||
    raw.platform_code ||
    fallbackPlatform ||
    '—'

  const plannedDate = planned ? new Date(planned) : null
  const realtimeDate = realtime ? new Date(realtime) : null
  let delayMinutes = null

  if (plannedDate && realtimeDate) {
    delayMinutes = Math.round((realtimeDate - plannedDate) / 60000)
  } else if (typeof raw.delay === 'number') {
    delayMinutes = Math.round(raw.delay / 60)
  } else if (typeof raw.delay?.minutes === 'number') {
    delayMinutes = raw.delay.minutes
  }

  const routeType =
    raw.route?.type ??
    raw.route_type ??
    raw.vehicle?.route_type ??
    (typeof raw.trip?.route_type === 'number' ? raw.trip.route_type : null)

  const transportKey = resolveTransportKey({
    routeType,
    vehicleType: raw.vehicle_type || raw.vehicleType,
    trafficType: raw.route?.type_name || raw.vehicle?.type,
  })

  let minutesUntil =
    departureTimestamp?.minutes ||
    raw.departure_timestamp?.minutes ||
    raw.departure_time?.minutes ||
    raw.minutes ||
    null

  if (minutesUntil == null) {
    const diff = toMinutesFromNow(realtime || planned)
    minutesUntil = diff != null ? Math.max(diff, 0) : null
  }

  const direction =
    raw.trip?.direction ||
    raw.direction ||
    raw.trip?.direction_text ||
    raw.trip?.directionName ||
    null

  return {
    id:
      raw.id ||
      raw.trip?.gtfs_trip_id ||
      `${line}-${destination}-${planned || Date.now()}`,
    line,
    destination,
    plannedTime: planned,
    realtimeTime: realtime,
    platform,
    vehicleType: raw.vehicle_type || raw.vehicleType || null,
    routeType,
    transportKey,
    direction,
    minutesUntil,
    delayMinutes,
  }
}

export const useTimetableStore = defineStore('timetable', {
  state: () => ({
    stops: [],
    stopsLoading: false,
    stopsError: null,
    selectedStop: null,
    departures: [],
    departuresLoading: false,
    departuresError: null,
    lastUpdated: null,
  }),
  getters: {
    hasSelection: (state) => Boolean(state.selectedStop),
    stopCount: (state) => state.stops.length,
  },
  actions: {
    async fetchStops(force = false) {
      if (this.stops.length && !force) {
        return
      }

      this.stopsLoading = true
      this.stopsError = null

      try {
        const { data } = await axios.get(STOP_LIST_URL, { timeout: 15000 })
        this.stops = normalizeStopGroups(data.stopGroups || [])
      } catch (error) {
        this.stopsError =
          error?.message || 'Unable to load PID stop list at the moment.'
      } finally {
        this.stopsLoading = false
      }
    },
    selectStop(stop) {
      this.selectedStop = stop
      this.fetchDepartures()
    },
    clearSelection() {
      this.selectedStop = null
      this.departures = []
      this.departuresError = null
    },
    async fetchDepartures() {
      if (!this.selectedStop) {
        return
      }

      if (!GOLEMIO_TOKEN) {
        this.departuresError =
          'Missing VITE_GOLEMIO_API_KEY. See README for setup instructions.'
        return
      }

      this.departuresLoading = true
      this.departuresError = null

      try {
        const params = {
          minutesBefore: 0,
          minutesAfter: 60,
          limit: 30,
        }

        if (this.selectedStop.cisId) {
          params['cisIds[]'] = this.selectedStop.cisId
        } else if (this.selectedStop.stopIds?.length) {
          params['ids[]'] = this.selectedStop.stopIds
        }

        const { data } = await axios.get(`${GOLEMIO_BASE_URL}/departureboards`, {
          headers: {
            'X-Access-Token': GOLEMIO_TOKEN,
            Accept: 'application/json',
          },
          params,
          paramsSerializer: {
            indexes: null,
          },
          timeout: 15000,
        })

        const departures =
          data?.departures?.map((item) => normalizeDeparture(item))?.filter(Boolean) || []

        this.departures = departures
        this.lastUpdated = new Date().toISOString()
      } catch (error) {
        if (error.response?.status === 401) {
          this.departuresError =
            'The provided Golemio API key was rejected. Double-check the token.'
        } else {
          this.departuresError =
            error?.message ||
            'Unable to load departures from the Golemio API right now.'
        }
      } finally {
        this.departuresLoading = false
      }
    },
  },
})


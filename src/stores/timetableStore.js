import { defineStore } from 'pinia'
import axios from 'axios'
import { resolveTransportKey } from '../utils/transport'

const STOP_LIST_URL =
  import.meta.env.VITE_STOPS_API_URL ||
  (import.meta.env.DEV
    ? '/pid-stops/stops/json/stops.json'
    : '/api/pid-stops')

const GOLEMIO_BASE_URL =
  import.meta.env.VITE_GOLEMIO_API_URL ||
  (import.meta.env.DEV ? '/golemio/v2/pid' : '/api/golemio')
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
        gtfsIds: group.stops.flatMap((stop) => stop.gtfsIds || []),
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

  // Extract GTFS trip ID for vehicle tracking
  const gtfsTripId =
    raw.trip?.id ||
    raw.trip?.gtfs_trip_id ||
    raw.trip?.gtfs?.trip_id ||
    raw.gtfs_trip_id ||
    null

  return {
    id:
      gtfsTripId ||
      raw.id ||
      `${line}-${destination}-${planned || Date.now()}`,
    gtfsTripId, // Store separately for vehicle tracking
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

const STOPS_CACHE_KEY = 'timetable_stops_cache'
const STOPS_CACHE_VERSION = 1
const CACHE_DURATION = 24 * 60 * 60 * 1000 // 24 hours

const loadStopsFromCache = () => {
  try {
    const cached = sessionStorage.getItem(STOPS_CACHE_KEY)
    if (!cached) return null

    const { version, timestamp, data } = JSON.parse(cached)

    // Check version and expiration
    if (version !== STOPS_CACHE_VERSION) {
      sessionStorage.removeItem(STOPS_CACHE_KEY)
      return null
    }

    const age = Date.now() - timestamp
    if (age > CACHE_DURATION) {
      sessionStorage.removeItem(STOPS_CACHE_KEY)
      return null
    }

    return data
  } catch (error) {
    console.warn('Failed to load stops from cache:', error)
    return null
  }
}

const saveStopsToCache = (stops) => {
  try {
    const cacheData = {
      version: STOPS_CACHE_VERSION,
      timestamp: Date.now(),
      data: stops,
    }
    sessionStorage.setItem(STOPS_CACHE_KEY, JSON.stringify(cacheData))
  } catch (error) {
    console.warn('Failed to save stops to cache:', error)
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
    trackedVehicle: null,
    vehicleLoading: false,
    vehicleError: null,
    trackingTarget: null,
  }),
  getters: {
    hasSelection: (state) => Boolean(state.selectedStop),
    stopCount: (state) => state.stops.length,
  },
  actions: {
    async fetchStops(force = false) {
      // Try to load from cache first
      if (!force) {
        const cachedStops = loadStopsFromCache()
        if (cachedStops && cachedStops.length > 0) {
          this.stops = cachedStops
          return
        }

        // If we already have stops in memory and not forcing, return
        if (this.stops.length > 0) {
          return
        }
      }

      this.stopsLoading = true
      this.stopsError = null

      try {
        const { data } = await axios.get(STOP_LIST_URL, { timeout: 15000 })
        this.stops = normalizeStopGroups(data.stopGroups || [])

        // Save to cache for future use
        saveStopsToCache(this.stops)
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

      // Only require API key in dev mode (production uses serverless function)
      if (import.meta.env.DEV && !GOLEMIO_TOKEN) {
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

        const headers = {
          Accept: 'application/json',
        }

        // Only send API key in dev mode (production uses serverless function)
        if (import.meta.env.DEV && GOLEMIO_TOKEN) {
          headers['X-Access-Token'] = GOLEMIO_TOKEN
        }

        const { data } = await axios.get(`${GOLEMIO_BASE_URL}/departureboards`, {
          headers,
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
        } else if (error.response?.status === 500) {
          this.departuresError =
            'Server error: Check that GOLEMIO_API_KEY is configured in Vercel.'
        } else {
          this.departuresError =
            error?.message ||
            'Unable to load departures from the Golemio API right now.'
        }
      } finally {
        this.departuresLoading = false
      }
    },
    async fetchVehiclePosition(tripId) {
      if (!tripId) {
        this.vehicleError = 'No trip ID provided'
        return
      }

      this.vehicleLoading = true
      this.vehicleError = null

      try {
        const headers = {
          Accept: 'application/json',
        }

        // Only send API key in dev mode (production uses serverless function)
        if (import.meta.env.DEV && GOLEMIO_TOKEN) {
          headers['X-Access-Token'] = GOLEMIO_TOKEN
        }

        // Get departure info for fallback
        const targetDeparture = this.trackingTarget || this.departures.find(d => d.id === tripId)

        const params = {
          includeNotTracking: true,
        }

        // Try to get specific vehicle by trip ID first
        let endpoint
        let path

        if (import.meta.env.DEV) {
          // In dev, try direct trip ID query first
          endpoint = `/golemio/v2/vehiclepositions/${encodeURIComponent(tripId)}`
        } else {
          // In production, use serverless function with path parameter
          path = `vehiclepositions/${encodeURIComponent(tripId)}`
          params.path = path
          endpoint = '/api/golemio'
        }

        console.log('Fetching vehicle by trip ID:', tripId)

        let data
        try {
          const response = await axios.get(endpoint, {
            headers,
            params,
            paramsSerializer: {
              indexes: null,
            },
            timeout: 15000,
          })
          data = response.data
        } catch (error) {
          // If direct trip ID query fails, fallback to filtering by route
          if (error.response?.status === 404 && targetDeparture?.line) {
            console.log('Trip ID not found, falling back to route filter:', targetDeparture.line)

            const fallbackParams = {
              routeShortName: targetDeparture.line,
            }

            if (!import.meta.env.DEV) {
              fallbackParams.path = 'vehiclepositions'
            }

            const fallbackEndpoint = import.meta.env.DEV
              ? '/golemio/v2/vehiclepositions'
              : '/api/golemio'

            const fallbackResponse = await axios.get(fallbackEndpoint, {
              headers,
              params: fallbackParams,
              paramsSerializer: {
                indexes: null,
              },
              timeout: 15000,
            })
            data = fallbackResponse.data
          } else {
            throw error
          }
        }

        // Handle different response formats
        let feature = null

        // Check if we got a single feature (direct trip ID query response)
        if (data?.geometry && data?.properties) {
          console.log('Got single feature response (direct trip ID match)')
          feature = data
        } else {
          // We got a FeatureCollection (route filter response)
          const features = data?.features || []

          console.log('Target departure:', targetDeparture)
          console.log('Total vehicles available:', features.length)

          // Try to find vehicle by matching trip ID in different property locations
          feature = features.find(f => {
            const props = f.properties || {}
            const vehicleTripId =
              props.trip?.gtfs?.trip_id ||
              props.trip?.gtfs_trip_id ||
              props.trip?.id ||
              props.gtfs_trip_id ||
              props.trip_id ||
              null

            if (vehicleTripId === tripId) {
              console.log('Found exact match by trip ID:', vehicleTripId)
              return true
            }
            return false
          })
        }

        // Fallback: If exact trip ID match not found, try matching by line and destination
        if (!feature && targetDeparture) {
          console.log('No exact trip ID match, trying line + destination matching...')

          // Also log some vehicle info to debug
          if (features.length > 0) {
            const sample = features.slice(0, 3).map(f => ({
              line: f.properties?.trip?.gtfs?.route_short_name,
              dest: f.properties?.trip?.gtfs?.trip_headsign,
            }))
            console.log('Sample vehicles (first 3):', sample)
          }

          feature = features.find(f => {
            const props = f.properties || {}
            // Try multiple property paths for line and destination
            const vehicleLine =
              props.trip?.gtfs?.route_short_name ||
              props.trip?.route_short_name ||
              props.route_short_name ||
              props.trip?.origin_route_name ||
              ''
            const vehicleDestination =
              props.trip?.gtfs?.trip_headsign ||
              props.trip?.headsign ||
              props.headsign ||
              ''

            const matches =
              vehicleLine === targetDeparture.line &&
              vehicleDestination === targetDeparture.destination

            if (matches) {
              console.log('Found match by line + destination:', vehicleLine, vehicleDestination)
            }

            return matches
          })

          if (!feature) {
            console.log('No match found for line:', targetDeparture.line, 'destination:', targetDeparture.destination)
          }
        }

        if (!feature) {
          // Log sample vehicle data to help debug
          if (features.length > 0) {
            console.log('Sample vehicle properties:', features[0].properties)
          }

          // Provide more specific error message
          const vehicleDesc = targetDeparture
            ? `Line ${targetDeparture.line} to ${targetDeparture.destination}`
            : 'This vehicle'

          throw new Error(
            `${vehicleDesc} is not currently being tracked. The vehicle may not have started its route yet, may have already completed it, or real-time tracking may not be available for this departure.`
          )
        }

        const props = feature.properties || {}
        const coords = feature.geometry?.coordinates || []

        // Normalize vehicle data
        this.trackedVehicle = {
          id: tripId,
          lat: coords[1],
          lon: coords[0],
          line:
            props.trip?.gtfs?.route_short_name ||
            props.trip?.route_short_name ||
            props.route_short_name ||
            props.trip?.origin_route_name ||
            '—',
          destination:
            props.trip?.gtfs?.trip_headsign ||
            props.trip?.headsign ||
            props.headsign ||
            '—',
          vehicleType: props.trip?.vehicle_type?.description_en || props.vehicle_type,
          transportKey: resolveTransportKey({
            routeType: props.trip?.gtfs?.route_type ?? props.trip?.route_type ?? props.route_type,
            vehicleType: props.trip?.vehicle_type?.description_en || props.vehicle_type,
          }),
          speed: props.last_position?.speed,
          delay: props.last_position?.delay?.actual
            ? Math.round(props.last_position.delay.actual / 60)
            : 0,
          timestamp: props.last_position?.origin_timestamp || new Date().toISOString(),
          // Include geometry/shape data if available
          geometry: feature.geometry,
          routeShape: props.trip?.shape || props.shape || null,
          nextStop: props.last_position?.next_stop || null,
          lastStop: props.last_position?.last_stop || null,
          // Additional rich data
          bearing: props.last_position?.bearing || null,
          vehicleNumber: props.trip?.vehicle_registration_number || null,
          agencyName: props.trip?.agency_name?.real || props.trip?.agency_name?.scheduled || null,
          wheelchairAccessible: props.trip?.wheelchair_accessible || false,
          airConditioned: props.trip?.air_conditioned || false,
          usbChargers: props.trip?.usb_chargers || false,
          statePosition: props.last_position?.state_position || null,
          isCanceled: props.last_position?.is_canceled || false,
          isTracking: props.last_position?.tracking || false,
          shapeDistTraveled: props.last_position?.shape_dist_traveled || null,
          nextStopSequence: props.last_position?.next_stop?.sequence || null,
          delayAtLastStop: {
            arrival: props.last_position?.delay?.last_stop_arrival || null,
            departure: props.last_position?.delay?.last_stop_departure || null,
          },
        }
      } catch (error) {
        this.vehicleError =
          error?.message || 'Unable to fetch vehicle position from the Golemio API.'
        throw error
      } finally {
        this.vehicleLoading = false
      }
    },
    clearVehicleTracking() {
      this.trackedVehicle = null
      this.vehicleError = null
      this.trackingTarget = null
    },
    setTrackingTarget(target) {
      this.trackingTarget = target
    },
  },
})


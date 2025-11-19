const ROUTE_TYPE_TO_KEY = {
  0: 'tram',
  1: 'metro',
  2: 'train',
  3: 'bus',
  4: 'ferry',
  7: 'funicular',
  11: 'trolleybus',
}

const VEHICLE_TYPE_HINTS = {
  tram: 'tram',
  tramway: 'tram',
  metro: 'metro',
  subway: 'metro',
  tube: 'metro',
  c: 'metro',
  airport_metro: 'metro',
  bus: 'bus',
  trolleybus: 'trolleybus',
  ferry: 'ferry',
  train: 'train',
  rail: 'train',
  funicular: 'funicular',
}

export const TRANSPORT_META = {
  metro: {
    label: 'Metro',
    code: 'M',
    color: '#00913a', // Default metro color (green like Line A)
    accent: 'var(--metro-accent)',
  },
  tram: {
    label: 'Tram',
    code: 'T',
    color: '#ffc56b',
    accent: 'var(--tram-accent)',
  },
  bus: {
    label: 'Bus',
    code: 'B',
    color: '#a7ff83',
    accent: 'var(--bus-accent)',
  },
  trolleybus: {
    label: 'Trolleybus',
    code: 'Tb',
    color: '#d8ff83',
    accent: 'var(--trolley-accent)',
  },
  train: {
    label: 'Train',
    code: 'S',
    color: '#adcdff',
    accent: 'var(--train-accent)',
  },
  ferry: {
    label: 'Ferry',
    code: 'F',
    color: '#a4f1ff',
    accent: 'var(--ferry-accent)',
  },
  funicular: {
    label: 'Funicular',
    code: 'Fn',
    color: '#ffdeb3',
    accent: 'var(--funicular-accent)',
  },
  default: {
    label: 'Transit',
    code: 'PT',
    color: '#d6ffd0',
    accent: 'var(--default-accent)',
  },
}

// Prague Metro line colors
export const METRO_LINE_COLORS = {
  A: '#00913a', // Green
  B: '#ffcd00', // Yellow
  C: '#c8102e', // Red
}

export const resolveTransportKey = ({ routeType, vehicleType, trafficType } = {}) => {
  if (routeType !== undefined && routeType !== null) {
    const key = ROUTE_TYPE_TO_KEY[routeType]
    if (key) {
      return key
    }
  }

  if (vehicleType) {
    const normalized = VEHICLE_TYPE_HINTS[String(vehicleType).toLowerCase()]
    if (normalized) {
      return normalized
    }
  }

  if (trafficType) {
    const normalized = VEHICLE_TYPE_HINTS[String(trafficType).toLowerCase()]
    if (normalized) {
      return normalized
    }
    return trafficType
  }

  return 'default'
}

export const getTransportMeta = (keyLike, lineName = null) => {
  if (!keyLike) {
    return TRANSPORT_META.default
  }

  const key = String(keyLike).toLowerCase()
  const baseMeta = TRANSPORT_META[key] || { ...TRANSPORT_META.default, label: capitalizeFirst(key) }

  // For metro, use line-specific color if available
  if (key === 'metro' && lineName && METRO_LINE_COLORS[lineName]) {
    return {
      ...baseMeta,
      color: METRO_LINE_COLORS[lineName]
    }
  }

  return baseMeta
}

const capitalizeFirst = (value) => value.charAt(0).toUpperCase() + value.slice(1)

/**
 * Generate SVG icon HTML for a specific transport type
 * @param {string} transportType - The type of transport (metro, tram, bus, trolleybus, etc.)
 * @param {number} size - The size of the icon in pixels (default: 20)
 * @returns {string} SVG HTML string
 */
/**
 * Get unique transport types from a stop's lines
 * @param {Array} lines - Array of line objects with type property
 * @returns {Array} Array of unique transport type strings
 */
export const getUniqueTransportTypes = (lines) => {
  if (!lines || !Array.isArray(lines)) return []

  const types = lines
    .map(line => line.type)
    .filter(Boolean)

  return [...new Set(types)]
}

export const getTransportIconSvg = (transportType, size = 20) => {
  const viewBox = '0 0 24 24'
  const fill = 'white'
  // Add a dark stroke/shadow for better contrast on bright backgrounds
  const svgStyle = 'style="filter: drop-shadow(0px 1px 1px rgba(0,0,0,0.5)) drop-shadow(0px 0px 1px rgba(0,0,0,0.7));"'

  switch (transportType?.toLowerCase()) {
    case 'metro':
      // Metro train icon
      return `
        <svg width="${size}" height="${size}" viewBox="${viewBox}" fill="${fill}" ${svgStyle}>
          <path d="M12 2C8 2 4 2.5 4 6v9.5C4 17.43 5.57 19 7.5 19L6 20.5v.5h2l2-2h4l2 2h2v-.5L16.5 19c1.93 0 3.5-1.57 3.5-3.5V6c0-3.5-4-4-8-4zm0 2c3.51 0 5.63.97 5.92 2H6.08C6.37 4.97 8.49 4 12 4zM6 7h5v3H6V7zm7 0h5v3h-5V7zM7.5 17c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>
        </svg>
      `
    case 'tram':
      // Tram icon
      return `
        <svg width="${size}" height="${size}" viewBox="${viewBox}" fill="${fill}" ${svgStyle}>
          <path d="M12 2c-4 0-8 .5-8 4v9.5C4 17.43 5.57 19 7.5 19L6 20v1h2.23l2-2H14l2 2H18v-1l-1.5-1c1.93 0 3.5-1.57 3.5-3.5V6c0-3.5-4-4-8-4zM7.5 17c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm3.5-7H6V6h5v4zm6 7c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm1-7h-5V6h5v4z"/>
        </svg>
      `
    case 'bus':
      // Bus icon
      return `
        <svg width="${size}" height="${size}" viewBox="${viewBox}" fill="${fill}" ${svgStyle}>
          <path d="M12 2c-4 0-8 .5-8 4v9.5C4 17.43 5.57 19 7.5 19L6 20.5v.5h2l2-2h4l2 2h2v-.5L16.5 19c1.93 0 3.5-1.57 3.5-3.5V6c0-3.5-4-4-8-4zm5.5 3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5S16 7.83 16 7s.67-1.5 1.5-1.5zm-11 0C7.33 5.5 8 6.17 8 7s-.67 1.5-1.5 1.5S5 7.83 5 7s.67-1.5 1.5-1.5zM6 9h12v3H6V9zm1.5 8c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>
        </svg>
      `
    case 'trolleybus':
      // Trolleybus icon (bus with antenna)
      return `
        <svg width="${size}" height="${size}" viewBox="${viewBox}" fill="${fill}" ${svgStyle}>
          <path d="M12 2c-4 0-8 .5-8 4v9.5C4 17.43 5.57 19 7.5 19L6 20.5v.5h2l2-2h4l2 2h2v-.5L16.5 19c1.93 0 3.5-1.57 3.5-3.5V6c0-3.5-4-4-8-4zM6 9h12v3H6V9zm1.5 8c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>
          <path d="M10 1L8 4h2V1zm4 0v3h2l-2-3z"/>
        </svg>
      `
    case 'train':
      // Train icon
      return `
        <svg width="${size}" height="${size}" viewBox="${viewBox}" fill="${fill}" ${svgStyle}>
          <path d="M12 2c-4 0-8 .5-8 4v9.5C4 17.43 5.57 19 7.5 19L6 20.5v.5h2l2-2h4l2 2h2v-.5L16.5 19c1.93 0 3.5-1.57 3.5-3.5V6c0-3.5-4-4-8-4zm0 2c3.51 0 5.63.97 5.92 2H6.08C6.37 4.97 8.49 4 12 4zM6 7h12v5H6V7zm1.5 10c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>
        </svg>
      `
    case 'ferry':
      // Ferry icon
      return `
        <svg width="${size}" height="${size}" viewBox="${viewBox}" fill="${fill}" ${svgStyle}>
          <path d="M20 21c-1.39 0-2.78-.47-4-1.32-2.44 1.71-5.56 1.71-8 0C6.78 20.53 5.39 21 4 21H2v2h2c1.38 0 2.74-.35 4-.99 2.52 1.29 5.48 1.29 8 0 1.26.65 2.62.99 4 .99h2v-2h-2zM3.95 19H4c1.6 0 3.02-.88 4-2 .98 1.12 2.4 2 4 2s3.02-.88 4-2c.98 1.12 2.4 2 4 2h.05l1.89-6.68c.08-.26.06-.54-.06-.78s-.34-.42-.6-.5L20 10.62V6c0-1.1-.9-2-2-2h-3V1H9v3H6c-1.1 0-2 .9-2 2v4.62l-1.29.42c-.26.08-.48.26-.6.5s-.15.52-.06.78L3.95 19zM6 6h12v3.97L12 8 6 9.97V6z"/>
        </svg>
      `
    case 'funicular':
      // Funicular icon (cable car)
      return `
        <svg width="${size}" height="${size}" viewBox="${viewBox}" fill="${fill}" ${svgStyle}>
          <path d="M12 2L6 6v3h12V6l-6-4zm-1 5h2v2h-2V7zm-6 5h18v9H5v-9zm2 2v5h4v-5H7zm6 0v5h4v-5h-4z"/>
        </svg>
      `
    default:
      // Generic vehicle icon
      return `
        <svg width="${size}" height="${size}" viewBox="${viewBox}" fill="${fill}" ${svgStyle}>
          <path d="M12 2L4 6v10l8 4 8-4V6l-8-4zm0 2.18l5.5 2.75L12 9.68 6.5 6.93 12 4.18zM6 8.93l5 2.5V19l-5-2.5V8.93zm7 10.07v-7.57l5-2.5V16.5l-5 2.5z"/>
        </svg>
      `
  }
}


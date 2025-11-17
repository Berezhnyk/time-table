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
    color: '#4ad1ff',
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

export const getTransportMeta = (keyLike) => {
  if (!keyLike) {
    return TRANSPORT_META.default
  }

  const key = String(keyLike).toLowerCase()
  return TRANSPORT_META[key] || { ...TRANSPORT_META.default, label: capitalizeFirst(key) }
}

const capitalizeFirst = (value) => value.charAt(0).toUpperCase() + value.slice(1)


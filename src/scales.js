const SCALES = {
  fibonacci: ['0', '1', '2', '3', '5', '8', '13', '21', '34', '?', '\u2615'],
  tshirt: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '?', '\u2615'],
  powers: ['0', '1', '2', '4', '8', '16', '32', '64', '?', '\u2615'],
};

function getScale(type, customJson) {
  if (type === 'custom' && customJson) {
    try {
      const values = JSON.parse(customJson);
      if (!values.includes('?')) values.push('?');
      if (!values.includes('\u2615')) values.push('\u2615');
      return values;
    } catch {
      return SCALES.fibonacci;
    }
  }
  return SCALES[type] || SCALES.fibonacci;
}

module.exports = { SCALES, getScale };

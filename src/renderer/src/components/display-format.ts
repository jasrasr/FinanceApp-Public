export const formatDollarString = (value: string): string => {
  const isNegative = value.startsWith('-');
  const absoluteValue = isNegative ? value.slice(1) : value;
  const [whole = '0', fraction = '00'] = absoluteValue.split('.');
  const groupedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const formatted = `$${groupedWhole}.${fraction.padEnd(2, '0').slice(0, 2)}`;
  return isNegative ? `-${formatted}` : formatted;
};

export const formatTimestamp = (value: string): string =>
  new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));

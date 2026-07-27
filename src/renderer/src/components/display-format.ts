export const formatDollarString = (value: string): string => {
  const [whole = '0', fraction = '00'] = value.split('.');
  const groupedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `$${groupedWhole}.${fraction.padEnd(2, '0').slice(0, 2)}`;
};

export const formatTimestamp = (value: string): string =>
  new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));

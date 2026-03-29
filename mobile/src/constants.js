export const CATEGORIES = [
  { id: 'repairs', label: 'Reparaciones' },
  { id: 'packages', label: 'Paquetes' },
  { id: 'pets', label: 'Mascotas' },
  { id: 'cleaning', label: 'Limpieza' },
  { id: 'transport', label: 'Transporte' },
  { id: 'tech', label: 'Tecnologia' },
  { id: 'gardening', label: 'Jardineria' },
  { id: 'care', label: 'Acompanamiento' },
  { id: 'tutoring', label: 'Clases' },
  { id: 'creative', label: 'Creativo' },
  { id: 'errands', label: 'Recados' },
  { id: 'other', label: 'Otros' },
];

export const COMPENSATION_OPTIONS = [
  { id: 'cash', label: 'Pago en efectivo' },
  { id: 'barter', label: 'Intercambio' },
  { id: 'altruistic', label: 'Ayuda solidaria' },
];

export const WHEN_OPTIONS = [
  { id: 'asap', label: 'Lo antes posible' },
  { id: 'today', label: 'Hoy' },
  { id: 'this_week', label: 'Esta semana' },
  { id: 'flexible', label: 'Flexible' },
];

export function categoryLabel(id) {
  const hit = CATEGORIES.find(c => c.id === id);
  return hit ? hit.label : id;
}

import { useEffect, useMemo, useState } from 'react';
import { asistenciaApi } from '@/api/asistencia.api';
import { SelectField } from '@/components/SelectField';
import { TextField } from '@/components/TextField';

const OTRO = '__otro__';

// Selector de cargo (Maestros → Cargos en la web). El valor es el NOMBRE del cargo: la API lo resuelve contra el maestro. Si la
// persona tiene un cargo que ya no está activo, se muestra igual para no perderlo. `permitirNuevo`: en el primer registro del
// colaborador se puede escribir un cargo que no está en la lista; la API lo crea en el maestro.
export function CargoSelectField({
  label = 'Cargo',
  value,
  onChange,
  permitirNuevo = false,
}: {
  label?: string;
  value: string;
  onChange: (nombre: string) => void;
  permitirNuevo?: boolean;
}) {
  const [cargos, setCargos] = useState<string[]>([]);
  const [escribiendo, setEscribiendo] = useState(false);

  useEffect(() => {
    let activo = true;
    asistenciaApi
      .listarCargos()
      .then((l) => activo && setCargos((l || []).map((c) => c.nombre)))
      .catch(() => {});
    return () => {
      activo = false;
    };
  }, []);

  const opciones = useMemo(() => {
    const nombres = value && !escribiendo && !cargos.includes(value) ? [value, ...cargos] : cargos;
    return [
      { value: '', label: 'Sin cargo' },
      ...nombres.map((n) => ({ value: n, label: n })),
      ...(permitirNuevo ? [{ value: OTRO, label: '+ Otro cargo (escribirlo)' }] : []),
    ];
  }, [cargos, value, escribiendo, permitirNuevo]);

  return (
    <>
      <SelectField
        label={label}
        value={escribiendo ? OTRO : value || ''}
        options={opciones}
        placeholder="Elige un cargo"
        onChange={(v) => {
          if (v === OTRO) {
            setEscribiendo(true);
            onChange('');
          } else {
            setEscribiendo(false);
            onChange(v || '');
          }
        }}
      />
      {escribiendo ? <TextField label="Escribe el cargo" value={value} onChangeText={onChange} autoCapitalize="sentences" /> : null}
    </>
  );
}

export default CargoSelectField;

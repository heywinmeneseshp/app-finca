import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing } from '@/constants/theme';

export interface SelectOption {
  value: string;
  label: string;
}

interface Props {
  label: string;
  value: string | null;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}

// Selector con búsqueda: abre una lista a pantalla completa y filtra mientras se escribe.
export function SelectField({ label, value, options, placeholder = 'Selecciona', disabled, onChange }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState('');

  const seleccionada = options.find((o) => o.value === value);
  const filtradas = useMemo(() => {
    // Cada palabra escrita debe estar en el texto (sin importar orden ni tildes): "perez juan" encuentra "Juan Pérez · 123".
    const normal = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const palabras = normal(busqueda).split(/\s+/).filter(Boolean);
    return palabras.length ? options.filter((o) => palabras.every((p) => normal(o.label).includes(p))) : options;
  }, [options, busqueda]);

  const cerrar = () => {
    setAbierto(false);
    setBusqueda('');
  };

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <Pressable style={[styles.input, disabled && { opacity: 0.5 }]} disabled={disabled} onPress={() => setAbierto(true)}>
        <Text style={seleccionada ? styles.valor : styles.placeholder} numberOfLines={1}>
          {seleccionada ? seleccionada.label : placeholder}
        </Text>
        <Feather name="chevron-down" size={18} color={colors.textMuted} />
      </Pressable>

      <Modal visible={abierto} animationType="slide" onRequestClose={cerrar}>
        <SafeAreaProvider>
        <SafeAreaView style={styles.modal} edges={['top', 'bottom', 'left', 'right']}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitulo}>{label}</Text>
            <Pressable onPress={cerrar} hitSlop={12}>
              <Text style={styles.cerrar}>Cerrar</Text>
            </Pressable>
          </View>
          <TextInput
            style={styles.buscar}
            placeholder="Buscar..."
            placeholderTextColor={colors.textMuted}
            value={busqueda}
            onChangeText={setBusqueda}
            autoCorrect={false}
          />
          <FlatList
            data={filtradas}
            keyExtractor={(o) => o.value}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<Text style={styles.vacio}>Sin resultados</Text>}
            renderItem={({ item }) => (
              <Pressable
                style={[styles.opcion, item.value === value && styles.opcionActiva]}
                onPress={() => {
                  onChange(item.value);
                  cerrar();
                }}
              >
                <Text style={[styles.opcionTexto, item.value === value && { color: colors.primary, fontWeight: '700' }]}>{item.label}</Text>
              </Pressable>
            )}
          />
        </SafeAreaView>
        </SafeAreaProvider>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: spacing.md },
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: spacing.xs },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  valor: { fontSize: 16, color: colors.text, flex: 1 },
  placeholder: { fontSize: 16, color: colors.textMuted, flex: 1 },
  modal: { flex: 1, backgroundColor: colors.background },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.md },
  modalTitulo: { fontSize: 18, fontWeight: '700', color: colors.text },
  cerrar: { color: colors.primary, fontSize: 16, fontWeight: '600' },
  buscar: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    color: colors.text,
  },
  opcion: { paddingVertical: 14, paddingHorizontal: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  opcionActiva: { backgroundColor: '#e8f6ee' },
  opcionTexto: { fontSize: 16, color: colors.text },
  vacio: { textAlign: 'center', color: colors.textMuted, padding: spacing.lg },
});

export default SelectField;

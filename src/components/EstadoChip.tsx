import { StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

interface Props {
  icono: React.ComponentProps<typeof Feather>['name'];
  texto: string;
  color: string;
}

// Indicador de estado compacto (conexión, GPS, motor facial) con icono minimalista.
export function EstadoChip({ icono, texto, color }: Props) {
  return (
    <View style={styles.chip}>
      <Feather name={icono} size={13} color={color} />
      <Text style={[styles.texto, { color }]}>{texto}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  texto: { fontSize: 12, fontWeight: '600' },
});

export default EstadoChip;

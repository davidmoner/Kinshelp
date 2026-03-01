import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../ui/Screen';
import { theme } from '../ui/theme';
import { useAuth } from '../state/auth';
import { listMessages } from '../api/khApi';

// MVP simplificado: usamos el endpoint de mensajes para mostrar contexto rapido.
// Luego: agregar endpoint /matches/:id para detalle completo.

export default function MatchDetailScreen({ route, navigation }) {
  const { token } = useAuth();
  const matchId = route.params?.matchId;
  const title = route.params?.title || 'Match';
  const [loading, setLoading] = React.useState(true);
  const [firstSystem, setFirstSystem] = React.useState(null);

  React.useEffect(() => {
    navigation.setOptions({ title });
  }, [title, navigation]);

  React.useEffect(() => {
    (async () => {
      if (!token || !matchId) return;
      setLoading(true);
      try {
        const out = await listMessages(token, matchId, { limit: 10, offset: 0 });
        const msgs = (out && out.data) || [];
        const sys = msgs.find(m => m.kind === 'system') || null;
        setFirstSystem(sys);
      } finally {
        setLoading(false);
      }
    })();
  }, [token, matchId]);

  return (
    <Screen>
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={theme.colors.brand} /></View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.h}>Estado y acuerdo</Text>
          <Text style={styles.p}>{firstSystem ? firstSystem.message : 'Sin mensajes de sistema aun.'}</Text>
          <Text style={styles.meta}>ID: {matchId}</Text>
        </View>
      )}

      <View style={styles.actions}>
        <Text style={styles.actionHint}>Abrir chat para continuar.</Text>
        <Text style={styles.actionLink} onPress={() => navigation.navigate('Chat', { matchId, title: `Chat` })}>
          Ir al chat
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: { backgroundColor: theme.colors.card, borderColor: theme.colors.border, borderWidth: 1, borderRadius: theme.radius.lg, padding: 16 },
  h: { color: theme.colors.text, fontSize: 16, fontWeight: '800' },
  p: { color: theme.colors.muted, marginTop: 8, lineHeight: 20 },
  meta: { color: theme.colors.muted, marginTop: 14, fontSize: 12 },
  actions: { marginTop: 14 },
  actionHint: { color: theme.colors.muted },
  actionLink: { color: theme.colors.brand, marginTop: 6, fontWeight: '800' },
});

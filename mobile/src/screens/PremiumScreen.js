import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../ui/Screen';
import { theme } from '../ui/theme';
import { useAuth } from '../state/auth';
import { premiumEligibility, premiumPlans, premiumUnlock } from '../api/khApi';

export default function PremiumScreen() {
  const { token } = useAuth();
  const [loading, setLoading] = React.useState(true);
  const [elig, setElig] = React.useState(null);
  const [plans, setPlans] = React.useState(null);
  const [error, setError] = React.useState(null);

  const load = React.useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const e = await premiumEligibility(token);
      const p = await premiumPlans(token);
      setElig(e);
      setPlans(p);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [token]);

  React.useEffect(() => {
    load();
  }, [load]);

  const unlock = async () => {
    try {
      await premiumUnlock(token);
      load();
    } catch (e) {
      setError(e);
    }
  };

  return (
    <Screen>
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={theme.colors.brand} /></View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          <Text style={styles.title}>Premium</Text>
          {error ? <Text style={styles.err}>{error.message || 'Error'}</Text> : null}

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Estado</Text>
            <Text style={styles.cardMeta}>Activo: {elig && elig.premium_active ? 'Si' : 'No'}</Text>
            <Text style={styles.cardMeta}>Tier: {elig && elig.premium_tier ? String(elig.premium_tier) : 'free'}</Text>
            <Text style={styles.cardMeta}>Hasta: {elig && elig.premium_until ? String(elig.premium_until) : '—'}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Desbloqueo por reputacion</Text>
            <Text style={styles.cardMeta}>Reputacion: {elig ? elig.reputation : 0}</Text>
            <Text style={styles.cardMeta}>Umbral: {elig ? elig.threshold : 0}</Text>
            <Text style={styles.cardMeta}>Vecinos distintos: {elig ? elig.partners_done_distinct : 0} / {elig ? elig.partners_required : 0}</Text>
            <Text style={styles.cardMeta}>Dias AutoMatch: {elig ? elig.premium_lite_days : 0}</Text>
            <Text style={styles.cardMeta}>Dias publicaciones: {elig ? elig.premium_lite_listing_days : 0}</Text>

            {!elig || elig.premium_active ? null : (
              <Pressable style={[styles.btn, styles.btnPrimary]} onPress={unlock} disabled={!(elig && elig.eligible)}>
                <Text style={styles.btnPrimaryText}>{elig && elig.eligible ? 'Desbloquear ahora' : 'Aun no disponible'}</Text>
              </Pressable>
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Planes de pago</Text>
            <Text style={styles.cardMeta}>Stripe pronto: {plans && plans.plans && plans.plans.length ? 'Disponible' : 'No disponible'}</Text>
            <Text style={styles.cardMeta}>AutoMatch Premium se desbloquea con reputacion.</Text>
          </View>

          <Pressable style={[styles.btn, styles.btnGhost]} onPress={load}>
            <Text style={styles.btnGhostText}>Actualizar</Text>
          </Pressable>
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { color: theme.colors.text, fontSize: 24, fontWeight: '800', marginBottom: 12 },
  err: { color: theme.colors.danger, marginBottom: 10 },
  card: { backgroundColor: theme.colors.card, borderColor: theme.colors.border, borderWidth: 1, borderRadius: theme.radius.lg, padding: 14, marginBottom: 12 },
  cardTitle: { color: theme.colors.text, fontWeight: '800', marginBottom: 6 },
  cardMeta: { color: theme.colors.muted, marginTop: 4 },
  btn: { borderRadius: theme.radius.md, paddingVertical: 12, paddingHorizontal: 14, alignItems: 'center', marginTop: 10 },
  btnPrimary: { backgroundColor: theme.colors.brand },
  btnPrimaryText: { color: '#0B1220', fontWeight: '800' },
  btnGhost: { borderWidth: 1, borderColor: theme.colors.border },
  btnGhostText: { color: theme.colors.text, fontWeight: '700' },
});

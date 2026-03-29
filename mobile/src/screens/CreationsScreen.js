import React from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../ui/Screen';
import { theme } from '../ui/theme';
import { useAuth } from '../state/auth';
import { boostOffer, boostRequest, closeOffer, closeRequest, listOffers, listRequests, me } from '../api/khApi';
import { categoryLabel } from '../constants';

function Row({ item, onClose, onBoost, onDetail }) {
  const status = item.status || item.state || 'open';
  return (
    <View style={styles.row}>
      <Text style={styles.rowTitle}>{item.title || 'Sin titulo'}</Text>
      <Text style={styles.rowMeta}>{categoryLabel(item.category)} · {item.location_text || 'Zona'} · {status}</Text>
      <View style={styles.rowActions}>
        <Pressable style={[styles.btn, styles.btnGhost]} onPress={onDetail}>
          <Text style={styles.btnGhostText}>Ver</Text>
        </Pressable>
        <Pressable style={[styles.btn, styles.btnGhost]} onPress={onBoost}>
          <Text style={styles.btnGhostText}>Boost 48h</Text>
        </Pressable>
        <Pressable style={[styles.btn, styles.btnDanger]} onPress={onClose}>
          <Text style={styles.btnDangerText}>Cerrar</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function CreationsScreen({ navigation }) {
  const { token } = useAuth();
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [tab, setTab] = React.useState('requests');
  const [items, setItems] = React.useState([]);

  const load = React.useCallback(async (isRefresh) => {
    if (!token) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const user = await me(token);
      if (tab === 'requests') {
        const out = await listRequests(token, { limit: 50, offset: 0, seeker_id: user.id, status: 'open' });
        setItems((out && out.data) || []);
      } else {
        const out = await listOffers(token, { limit: 50, offset: 0, provider_id: user.id, status: 'active' });
        setItems((out && out.data) || []);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, tab]);

  React.useEffect(() => {
    load(false);
  }, [load]);

  const onClose = (item) => {
    Alert.alert('Cerrar', 'Quieres cerrar esta publicacion?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Cerrar',
        style: 'destructive',
        onPress: async () => {
          if (tab === 'requests') await closeRequest(token, item.id);
          else await closeOffer(token, item.id);
          load(true);
        },
      },
    ]);
  };

  const onBoost = async (item) => {
    try {
      if (tab === 'requests') await boostRequest(token, item.id);
      else await boostOffer(token, item.id);
      load(true);
    } catch (e) {
      Alert.alert('Boost', e.message || 'No disponible');
    }
  };

  return (
    <Screen style={{ padding: 0 }}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={theme.colors.brand} />}
      >
        <Text style={styles.title}>Creaciones</Text>
        <View style={styles.tabRow}>
          <Pressable style={[styles.tabBtn, tab === 'requests' && styles.tabBtnActive]} onPress={() => setTab('requests')}>
            <Text style={[styles.tabText, tab === 'requests' && styles.tabTextActive]}>Solicitudes</Text>
          </Pressable>
          <Pressable style={[styles.tabBtn, tab === 'offers' && styles.tabBtnActive]} onPress={() => setTab('offers')}>
            <Text style={[styles.tabText, tab === 'offers' && styles.tabTextActive]}>Ofertas</Text>
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.center}><ActivityIndicator color={theme.colors.brand} /></View>
        ) : !items.length ? (
          <Text style={styles.empty}>No hay publicaciones activas.</Text>
        ) : (
          items.map((it) => (
            <Row
              key={it.id}
              item={it}
              onClose={() => onClose(it)}
              onBoost={() => onBoost(it)}
              onDetail={() => navigation.navigate('FeedDetail', { kind: tab === 'offers' ? 'offer' : 'request', id: it.id })}
            />
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { paddingVertical: 30, alignItems: 'center' },
  title: { color: theme.colors.text, fontSize: 24, fontWeight: '800', marginBottom: 12 },
  empty: { color: theme.colors.muted, textAlign: 'center', marginTop: 20 },
  tabRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  tabBtn: { flex: 1, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, paddingVertical: 10 },
  tabBtnActive: { borderColor: theme.colors.brand, backgroundColor: 'rgba(42, 212, 165, 0.15)' },
  tabText: { color: theme.colors.muted, textAlign: 'center', fontWeight: '700' },
  tabTextActive: { color: theme.colors.text },
  row: { backgroundColor: theme.colors.card, borderColor: theme.colors.border, borderWidth: 1, borderRadius: theme.radius.lg, padding: 14, marginBottom: 12 },
  rowTitle: { color: theme.colors.text, fontWeight: '800', fontSize: 16 },
  rowMeta: { color: theme.colors.muted, marginTop: 6 },
  rowActions: { flexDirection: 'row', gap: 10, marginTop: 10, flexWrap: 'wrap' },
  btn: { borderRadius: theme.radius.md, paddingVertical: 8, paddingHorizontal: 12 },
  btnGhost: { borderWidth: 1, borderColor: theme.colors.border },
  btnGhostText: { color: theme.colors.text, fontWeight: '700' },
  btnDanger: { borderWidth: 1, borderColor: 'rgba(255,90,122,0.5)', backgroundColor: 'rgba(255,90,122,0.12)' },
  btnDangerText: { color: theme.colors.danger, fontWeight: '700' },
});

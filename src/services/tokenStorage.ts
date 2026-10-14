import * as SecureStore from 'expo-secure-store';

const ACCESS_TOKEN_KEY = 'finca.accessToken';
const REFRESH_TOKEN_KEY = 'finca.refreshToken';

export const tokenStorage = {
  getAccessToken: (): Promise<string | null> => SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
  getRefreshToken: (): Promise<string | null> => SecureStore.getItemAsync(REFRESH_TOKEN_KEY),

  async setTokens(accessToken: string, refreshToken: string): Promise<void> {
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken);
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
  },

  async clearTokens(): Promise<void> {
    await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  },
};

export default tokenStorage;

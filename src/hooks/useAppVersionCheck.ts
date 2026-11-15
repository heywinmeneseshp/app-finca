import { useEffect, useState } from 'react';
import Constants from 'expo-constants';
import { appVersionApi, type AppVersionInfo } from '@/api/appVersion.api';
import { isVersionLower } from '@/utils/semver';

export type UpdateStatus = 'checking' | 'up-to-date' | 'update-available' | 'update-required';

export const useAppVersionCheck = () => {
  const [status, setStatus] = useState<UpdateStatus>('checking');
  const [info, setInfo] = useState<AppVersionInfo | null>(null);
  const currentVersion = Constants.expoConfig?.version ?? '0.0.0';

  const check = async () => {
    try {
      const data = await appVersionApi.get();
      setInfo(data);
      if (isVersionLower(currentVersion, data.minSupportedVersion)) {
        setStatus('update-required');
      } else if (isVersionLower(currentVersion, data.latestVersion)) {
        setStatus('update-available');
      } else {
        setStatus('up-to-date');
      }
    } catch {
      // Sin conexión o backend caído: no bloquear al usuario por esto, solo
      // se difiere el chequeo — no tiene sentido tapar la app offline por
      // no poder confirmar si hay una versión nueva.
      setStatus('up-to-date');
    }
  };

  useEffect(() => {
    check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { status, info, currentVersion, recheck: check };
};

export default useAppVersionCheck;

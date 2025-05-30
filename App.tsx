
import React, { useState, useEffect, useCallback } from 'react';
import { ParsedTimetableData, BusService, NextDepartureInfo } from './types';
import { parseCSV } from './services/csvParser';
import FileUpload from './components/FileUpload';
import FilterControls from './components/FilterControls';
import TimetableDisplay from './components/TimetableDisplay';
import CountdownTimer from './components/CountdownTimer'; // Re-added CountdownTimer import
import { BusIcon } from './components/icons/BusIcon';
import { ClockIcon } from './components/icons/ClockIcon';
import { AlertIcon } from './components/icons/AlertIcon';

const LOCAL_STORAGE_TIMETABLE_KEY = 'busTimetableApp_timetableData';
const LOCAL_STORAGE_ROUTE_KEY = 'busTimetableApp_selectedRoute';
const LOCAL_STORAGE_EXCLUDE_REMARKS_KEY = 'busTimetableApp_excludeRemarks';


const getDayTypeForFiltering = (date: Date): string => {
  const day = date.getDay();
  switch (day) {
    case 0: return "日祝";
    case 6: return "土曜日";
    default: return "平日";
  }
};

const App: React.FC = () => {
  const [timetableData, setTimetableData] = useState<ParsedTimetableData | null>(null);
  const [filteredServices, setFilteredServices] = useState<BusService[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<string>('すべて'); // Initialize to 'すべて'
  const [excludeRemarks, setExcludeRemarks] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [nextDepartureInfos, setNextDepartureInfos] = useState<NextDepartureInfo[]>([]);

  // Load data from localStorage on initial mount
  useEffect(() => {
    try {
      const storedTimetableData = localStorage.getItem(LOCAL_STORAGE_TIMETABLE_KEY);
      if (storedTimetableData) {
        const parsedData = JSON.parse(storedTimetableData) as ParsedTimetableData;
        setTimetableData(parsedData);
        const storedRoute = localStorage.getItem(LOCAL_STORAGE_ROUTE_KEY);
        if (storedRoute && (storedRoute === 'すべて' || parsedData.routeIds.includes(storedRoute))) {
          setSelectedRoute(storedRoute);
        } else {
          setSelectedRoute('すべて'); // Default to 'すべて' if stored route is invalid
        }
      } else {
        setSelectedRoute('すべて'); // No stored data, default to 'すべて'
      }
      const storedExcludeRemarks = localStorage.getItem(LOCAL_STORAGE_EXCLUDE_REMARKS_KEY);
      if (storedExcludeRemarks) {
        setExcludeRemarks(JSON.parse(storedExcludeRemarks));
      }
    } catch (e) {
      console.error("Failed to load data from localStorage:", e);
      localStorage.removeItem(LOCAL_STORAGE_TIMETABLE_KEY);
      localStorage.removeItem(LOCAL_STORAGE_ROUTE_KEY);
      localStorage.removeItem(LOCAL_STORAGE_EXCLUDE_REMARKS_KEY);
      setSelectedRoute('すべて'); // On error, default to 'すべて'
      setTimetableData(null);
    }
  }, []);

  // Update currentTime every second
  useEffect(() => {
    const timerId = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timerId);
  }, []);

  const handleFileUploaded = useCallback(async (file: File) => {
    setIsLoading(true);
    setError(null);

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const csvString = e.target?.result as string;
        if (!csvString) {
          throw new Error("ファイルの内容を読み取れませんでした。");
        }
        const parsedDataFromNewFile = await parseCSV(csvString, file.name);
        
        const existingServices = timetableData?.services || [];
        const existingRouteIds = timetableData?.routeIds || [];

        const servicesToKeep = existingServices.filter(
          service => !parsedDataFromNewFile.routeIds.includes(service.routeId)
        );

        const updatedServices = [...servicesToKeep, ...parsedDataFromNewFile.services];
        
        const updatedRouteIds = Array.from(new Set([...existingRouteIds, ...parsedDataFromNewFile.routeIds])).sort();

        const newCombinedData: ParsedTimetableData = {
          services: updatedServices,
          routeIds: updatedRouteIds,
        };
        
        setTimetableData(newCombinedData);
        localStorage.setItem(LOCAL_STORAGE_TIMETABLE_KEY, JSON.stringify(newCombinedData));

        let newSelectedRoute = 'すべて'; // Default to 'すべて'
        // If a specific route (not 'すべて') was selected and is still valid, keep it.
        if (selectedRoute && selectedRoute !== 'すべて' && newCombinedData.routeIds.includes(selectedRoute)) {
          newSelectedRoute = selectedRoute;
        }
        
        setSelectedRoute(newSelectedRoute);
        localStorage.setItem(LOCAL_STORAGE_ROUTE_KEY, newSelectedRoute);

      } catch (err: any) {
        setError(err.message || 'CSVファイルの解析中にエラーが発生しました。');
      } finally {
        setIsLoading(false);
      }
    };
    reader.onerror = () => {
      setError('ファイルの読み込みに失敗しました。');
      setIsLoading(false);
    };
    reader.readAsText(file, 'UTF-8');
  }, [timetableData, selectedRoute]);

  // Effect for filtering services and finding next departure
  useEffect(() => {
    if (!timetableData) {
      setFilteredServices([]);
      setNextDepartureInfos([]);
      return;
    }

    const currentDayType = getDayTypeForFiltering(currentTime);
    // 1. Initial filter for day and remarks. This is the base for both display and countdown.
    let baseFilteredServices = timetableData.services.filter(s => s.dayOfWeek === currentDayType);
    if (excludeRemarks) {
      baseFilteredServices = baseFilteredServices.filter(s => !s.remarks || s.remarks.trim() === '');
    }

    // 2. Prepare services for countdown.
    // If a specific route is selected, filter for that route. Otherwise, use all routes from baseFilteredServices.
    let servicesForCountdown: BusService[];
    if (selectedRoute && selectedRoute !== 'すべて') {
      servicesForCountdown = baseFilteredServices.filter(s => s.routeId === selectedRoute);
    } else {
      servicesForCountdown = [...baseFilteredServices]; // Use a copy for all routes
    }
    
    // 3. Process servicesForCountdown to get future, sorted departures
    const futureServicesForCountdown = servicesForCountdown
      .map(s => {
        const [hours, minutes] = s.departureTime.split(':').map(Number);
        const serviceDate = new Date(currentTime);
        serviceDate.setHours(hours, minutes, 0, 0);
        return { ...s, exactTime: serviceDate };
      })
      .filter(s => s.exactTime.getTime() >= currentTime.getTime())
      .sort((a, b) => a.exactTime.getTime() - b.exactTime.getTime());

    // 4. Determine what to show in countdown timers
    let calculatedDeparturesToShow: NextDepartureInfo[] = [];
    if (futureServicesForCountdown.length > 0) {
      if (selectedRoute && selectedRoute !== 'すべて') {
        // Specific route selected: show only the next one for that route
        const nextBus = futureServicesForCountdown[0];
        calculatedDeparturesToShow.push({
          stopName: nextBus.stopName,
          departureTime: nextBus.departureTime,
          remarks: nextBus.remarks,
          routeId: nextBus.routeId,
        });
      } else {
        // "すべて" selected: try to show up to 2 distinct routes
        const distinctDepartures: NextDepartureInfo[] = [];
        const seenRouteIds = new Set<string>();

        for (const nextBus of futureServicesForCountdown) {
          if (distinctDepartures.length >= 2) break; // Max 2 distinct routes

          if (!seenRouteIds.has(nextBus.routeId)) {
            distinctDepartures.push({
              stopName: nextBus.stopName,
              departureTime: nextBus.departureTime,
              remarks: nextBus.remarks,
              routeId: nextBus.routeId,
            });
            seenRouteIds.add(nextBus.routeId);
          }
        }
        calculatedDeparturesToShow = distinctDepartures;
      }
    }
    setNextDepartureInfos(calculatedDeparturesToShow);
    
    // 5. Prepare services for the main TimetableDisplay.
    // If a specific route is selected, filter baseFilteredServices for that route. Otherwise, use all.
    let servicesForDisplay: BusService[];
    if (selectedRoute && selectedRoute !== 'すべて') {
      servicesForDisplay = baseFilteredServices.filter(s => s.routeId === selectedRoute);
    } else {
      servicesForDisplay = [...baseFilteredServices]; // Use a copy for all routes
    }
    setFilteredServices(servicesForDisplay);

    // Save selections to localStorage
    if (timetableData) { 
        localStorage.setItem(LOCAL_STORAGE_ROUTE_KEY, selectedRoute);
    }
    localStorage.setItem(LOCAL_STORAGE_EXCLUDE_REMARKS_KEY, JSON.stringify(excludeRemarks));

  }, [timetableData, selectedRoute, currentTime, excludeRemarks]);

  const routeOptions = timetableData?.routeIds ? ['すべて', ...timetableData.routeIds] : ['すべて'];
  
  const clearTimetableData = () => {
    setTimetableData(null);
    setSelectedRoute('すべて'); // Default to 'すべて'
    setFilteredServices([]);
    setNextDepartureInfos([]);
    setError(null);
    localStorage.removeItem(LOCAL_STORAGE_TIMETABLE_KEY);
    localStorage.setItem(LOCAL_STORAGE_ROUTE_KEY, 'すべて'); // Persist 'すべて' as selection
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-gray-100 p-4 sm:p-8 flex flex-col items-center">
      <header className="w-full max-w-4xl mb-6 text-center">
        <div className="flex items-center justify-center space-x-3">
          <BusIcon className="w-12 h-12 text-sky-400" />
          <h1 className="text-4xl font-bold text-sky-400">バス時刻表アプリ</h1>
        </div>
        {timetableData && timetableData.services.length > 0 ? (
          <>
            <p className="text-slate-400 mt-2">現在の時刻表は以下の通りです。別の路線を追加したり、既存の路線を更新するには、CSVファイルをアップロードしてください。</p>
            <p className="text-xs text-slate-500 mt-1">ファイル名が路線名/バス停名として扱われます。</p>
          </>
        ) : (
          <>
            <p className="text-slate-400 mt-2">CSVファイルをアップロードして、今日のバスの時刻表を確認しましょう。</p>
            <p className="text-xs text-slate-500 mt-1">期待されるCSV形式 (ヘッダー行を含む):<br/> <code className="text-slate-400">時刻(時),曜日,時刻(分)</code> (必須)<br/><code className="text-slate-400">備考</code> (任意)</p>
          </>
        )}
      </header>

      <main className="w-full max-w-4xl space-y-6">
        {isLoading && (
          <div className="flex justify-center items-center p-6 bg-slate-800/[.7] backdrop-blur-md shadow-2xl rounded-xl">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500"></div>
            <p className="ml-4 text-lg text-sky-400">データを読み込んでいます...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-800/[.7] border border-red-700 text-red-100 px-4 py-3 rounded-xl shadow-lg relative flex items-center" role="alert">
            <AlertIcon className="w-6 h-6 mr-3 text-red-300" />
            <div>
              <strong className="font-bold">エラー:</strong>
              <span className="block sm:inline ml-1">{error}</span>
            </div>
             <button onClick={() => setError(null)} className="absolute top-0 bottom-0 right-0 px-4 py-3 text-red-300 hover:text-red-100">
              <svg className="fill-current h-6 w-6" role="button" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><title>閉じる</title><path d="M14.348 14.849a1.2 1.2 0 0 1-1.697 0L10 11.819l-2.651 3.029a1.2 1.2 0 1 1-1.697-1.697l2.758-3.15-2.759-3.152a1.2 1.2 0 1 1 1.697-1.697L10 8.183l2.651-3.031a1.2 1.2 0 1 1 1.697 1.697l-2.758 3.152 2.758 3.15a1.2 1.2 0 0 1 0 1.698z"/></svg>
            </button>
          </div>
        )}
        
        {timetableData && timetableData.services.length > 0 && !isLoading && !error && (
          <div className="bg-slate-800/[.7] backdrop-blur-md shadow-2xl rounded-xl p-6 space-y-6">
            {nextDepartureInfos.map((departure, index) => (
              <CountdownTimer 
                key={`${departure.routeId}-${departure.stopName}-${departure.departureTime}-${index}`} 
                nextDeparture={departure} 
                currentTime={currentTime} 
              />
            ))}
            <FilterControls
              routeIds={routeOptions}
              selectedRoute={selectedRoute} // Directly pass selectedRoute state
              onRouteChanged={setSelectedRoute}
              excludeRemarks={excludeRemarks}
              onExcludeRemarksChanged={setExcludeRemarks}
            />
            <div className="flex items-center justify-between text-sm text-slate-400 pt-2 border-t border-slate-700">
              <span className="font-semibold">本日の曜日: {getDayTypeForFiltering(currentTime)}</span>
              <div className="flex items-center">
                <ClockIcon className="w-5 h-5 mr-2 text-sky-400" />
                <span>現在時刻: {currentTime.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
              </div>
            </div>
            <TimetableDisplay services={filteredServices} currentTime={currentTime} />
          </div>
        )}
        
        {(!timetableData || timetableData.services.length === 0) && !isLoading && !error && (
           <div className="text-center text-slate-500 py-10 bg-slate-800/[.7] backdrop-blur-md shadow-2xl rounded-xl p-6">
             <BusIcon className="w-16 h-16 mx-auto mb-4 text-slate-600" />
             <p className="text-xl">時刻表データが読み込まれていません。</p>
             <p>CSVファイルをアップロードして開始してください。</p>
           </div>
        )}

        <div className="bg-slate-800/[.7] backdrop-blur-md shadow-2xl rounded-xl p-6">
          <FileUpload onFileUploaded={handleFileUploaded} />
           {timetableData && timetableData.services.length > 0 && (
            <button 
              onClick={clearTimetableData} 
              className="mt-4 w-full text-sm bg-red-700 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-150"
            >
              時刻表データをすべてクリア
            </button>
          )}
        </div>

      </main>
      <footer className="w-full max-w-4xl mt-12 text-center text-sm text-slate-500">
        <p>&copy; {new Date().getFullYear()} バス時刻表アプリ. All rights reserved.</p>
      </footer>
    </div>
  );
};

export default App;

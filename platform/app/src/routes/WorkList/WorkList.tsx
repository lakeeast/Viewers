import React, { useState, useEffect, useMemo } from 'react';
import classnames from 'classnames';
import PropTypes from 'prop-types';
import { Link, useNavigate } from 'react-router-dom';
import moment from 'moment';
import qs from 'query-string';
import isEqual from 'lodash.isequal';
import { useTranslation } from 'react-i18next';
import filtersMeta from './filtersMeta.js';
import { useAppConfig } from '@state';
import { useDebounce, useSearchParams } from '@hooks';
import { utils, hotkeys } from '@ohif/core';
import {
  Icon,
  StudyListExpandedRow,
  EmptyStudies,
  StudyListTable,
  StudyListPagination,
  StudyListFilter,
  TooltipClipboard,
  Header,
  useModal,
  AboutModal,
  UserPreferences,
  LoadingIndicatorProgress,
  useSessionStorage,
  InvestigationalUseDialog,
  Button,
  ButtonEnums,
} from '@ohif/ui';
import { Types } from '@ohif/ui';
import i18n from '@ohif/i18n';
import { Onboarding } from '@ohif/ui-next';

const PatientInfoVisibility = Types.PatientInfoVisibility;
const { sortBySeriesDate } = utils;
const { availableLanguages, defaultLanguage, currentLanguage } = i18n;
const seriesInStudiesMap = new Map();

interface WorkListProps {
  data: any[];
  dataTotal: number;
  isLoadingData: boolean;
  dataSource: any;
  hotkeysManager?: any;
  dataPath?: string;
  onRefresh: () => void;
  servicesManager: any;
}

function WorkList({
  data: studies,
  dataTotal: studiesTotal,
  isLoadingData,
  dataSource,
  hotkeysManager,
  dataPath,
  onRefresh,
  servicesManager,
}: WorkListProps) {
  const { hotkeyDefinitions = {}, hotkeyDefaults = [] } = hotkeysManager || {};
  const { show, hide } = useModal();
  const { t } = useTranslation();
  const [appConfig] = useAppConfig();
  const searchParams = useSearchParams();
  const navigate = useNavigate();
  const STUDIES_LIMIT = 101;
  const queryFilterValues = _getQueryFilterValues(searchParams);
  const [sessionQueryFilterValues, updateSessionQueryFilterValues] = useSessionStorage({
    key: 'queryFilterValues',
    defaultValue: queryFilterValues,
    clearOnUnload: true,
  });
  const [filterValues, _setFilterValues] = useState({
    ...defaultFilterValues,
    ...sessionQueryFilterValues,
  });

  const debouncedFilterValues = useDebounce(filterValues, 200);
  const { resultsPerPage, pageNumber, sortBy, sortDirection } = filterValues;

  const canSort = studiesTotal < STUDIES_LIMIT;
  const shouldUseDefaultSort = sortBy === '' || !sortBy;
  const sortModifier = sortDirection === 'descending' ? 1 : -1;
  const defaultSortValues =
    shouldUseDefaultSort && canSort ? { sortBy: 'studyDate', sortDirection: 'ascending' } : {};
  const sortedStudies = studies;

  if (canSort) {
    studies.sort((s1, s2) => {
      if (shouldUseDefaultSort) {
        const ascendingSortModifier = -1;
        return _sortStringDates(s1, s2, ascendingSortModifier);
      }
      const s1Prop = s1[sortBy];
      const s2Prop = s2[sortBy];
      if (typeof s1Prop === 'string' && typeof s2Prop === 'string') {
        return s1Prop.localeCompare(s2Prop) * sortModifier;
      } else if (typeof s1Prop === 'number' && typeof s2Prop === 'number') {
        return (s1Prop > s2Prop ? 1 : -1) * sortModifier;
      } else if (!s1Prop && s2Prop) {
        return -1 * sortModifier;
      } else if (!s2Prop && s1Prop) {
        return 1 * sortModifier;
      } else if (sortBy === 'studyDate') {
        return _sortStringDates(s1, s2, sortModifier);
      }
      return 0;
    });
  }

  const [expandedRows, setExpandedRows] = useState<number[]>([]);
  const [studiesWithSeriesData, setStudiesWithSeriesData] = useState<string[]>([]);
  const numOfStudies = studiesTotal;
  const querying = useMemo(() => isLoadingData || expandedRows.length > 0, [isLoadingData, expandedRows]);

  const setFilterValues = (val: any) => {
    if (filterValues.pageNumber === val.pageNumber) {
      val.pageNumber = 1;
    }
    _setFilterValues(val);
    updateSessionQueryFilterValues(val);
    setExpandedRows([]);
  };

  const onPageNumberChange = (newPageNumber: number) => {
    const oldPageNumber = filterValues.pageNumber;
    const rollingPageNumberMod = Math.floor(101 / filterValues.resultsPerPage);
    const rollingPageNumber = oldPageNumber % rollingPageNumberMod;
    const isNextPage = newPageNumber > oldPageNumber;
    const hasNextPage = Math.max(rollingPageNumber, 1) * resultsPerPage < numOfStudies;

    if (isNextPage && !hasNextPage) {
      return;
    }
    setFilterValues({ ...filterValues, pageNumber: newPageNumber });
  };

  const onResultsPerPageChange = (newResultsPerPage: number) => {
    setFilterValues({
      ...filterValues,
      pageNumber: 1,
      resultsPerPage: Number(newResultsPerPage),
    });
  };

  useEffect(() => {
    document.body.classList.add('bg-black');
    return () => document.body.classList.remove('bg-black');
  }, []);

  useEffect(() => {
    if (!debouncedFilterValues) {
      return;
    }

    const queryString = {};
    Object.keys(defaultFilterValues).forEach(key => {
      const defaultValue = defaultFilterValues[key];
      const currValue = debouncedFilterValues[key];
      if (key === 'studyDate') {
        if (currValue.startDate && defaultValue.startDate !== currValue.startDate) {
          queryString.startDate = currValue.startDate;
        }
        if (currValue.endDate && defaultValue.endDate !== currValue.endDate) {
          queryString.endDate = currValue.endDate;
        }
      } else if (key === 'modalities' && currValue.length) {
        queryString.modalities = currValue.join(',');
      } else if (currValue !== defaultValue) {
        queryString[key] = currValue;
      }
    });

    const currentParams = new URLSearchParams(window.location.search);
    const preservedParams = {};
    for (const [key, value] of currentParams) {
      if (!queryString.hasOwnProperty(key)) {
        preservedParams[key] = value;
      }
    }

    const finalQueryString = { ...preservedParams, ...queryString };
    const search = qs.stringify(finalQueryString, { skipNull: true, skipEmptyString: true });
    const currentHash = window.location.hash || '';
    const currentPathname = window.location.pathname;

    const currentSearch = window.location.search.slice(1);
    if (search !== currentSearch) {
      navigate({
        pathname: currentPathname,
        search: search ? `?${search}` : undefined,
        hash: currentHash,
      });
    }
  }, [debouncedFilterValues, navigate]);

  useEffect(() => {
    const fetchSeries = async (studyInstanceUid: string) => {
      try {
        const series = await dataSource.query.series.search(studyInstanceUid);
        seriesInStudiesMap.set(studyInstanceUid, sortBySeriesDate(series));
        setStudiesWithSeriesData([...studiesWithSeriesData, studyInstanceUid]);
      } catch (ex) {
        console.warn(ex);
      }
    };

    for (let z = 0; z < expandedRows.length; z++) {
      const expandedRowIndex = expandedRows[z] - 1;
      const studyInstanceUid = sortedStudies[expandedRowIndex].studyInstanceUid;
      if (studiesWithSeriesData.includes(studyInstanceUid)) {
        continue;
      }
      fetchSeries(studyInstanceUid);
    }
  }, [expandedRows, studies, dataSource]);

  const isFiltering = (filterValues: any, defaultFilterValues: any) => !isEqual(filterValues, defaultFilterValues);

  const rollingPageNumberMod = Math.floor(101 / resultsPerPage);
  const rollingPageNumber = (pageNumber - 1) % rollingPageNumberMod;
  const offset = resultsPerPage * rollingPageNumber;
  const offsetAndTake = offset + resultsPerPage;
  const tableDataSource = sortedStudies.map((study, key) => {
    const rowKey = key + 1;
    const isExpanded = expandedRows.some(k => k === rowKey);
    const { studyInstanceUid, accession, modalities, instances, description, mrn, patientName, date, time } = study;
    const studyDate =
      date &&
      moment(date, ['YYYYMMDD', 'YYYY.MM.DD'], true).isValid() &&
      moment(date, ['YYYYMMDD', 'YYYY.MM.DD']).format(t('Common:localDateFormat', 'MMM-DD-YYYY'));
    const studyTime =
      time &&
      moment(time, ['HH', 'HHmm', 'HHmmss', 'HHmmss.SSS']).isValid() &&
      moment(time, ['HH', 'HHmm', 'HHmmss', 'HHmmss.SSS']).format(t('Common:localTimeFormat', 'hh:mm A'));

    return {
      dataCY: `studyRow-${studyInstanceUid}`,
      clickableCY: studyInstanceUid,
      row: [
        {
          key: 'patientName',
          content: patientName ? <TooltipClipboard>{patientName}</TooltipClipboard> : <span className="text-gray-700">(Empty)</span>,
          gridCol: 4,
        },
        { key: 'mrn', content: <TooltipClipboard>{mrn}</TooltipClipboard>, gridCol: 3 },
        {
          key: 'studyDate',
          content: (
            <>
              {studyDate && <span className="mr-4">{studyDate}</span>}
              {studyTime && <span>{studyTime}</span>}
            </>
          ),
          title: `${studyDate || ''} ${studyTime || ''}`,
          gridCol: 5,
        },
        { key: 'description', content: <TooltipClipboard>{description}</TooltipClipboard>, gridCol: 4 },
        { key: 'modality', content: modalities, title: modalities, gridCol: 3 },
        { key: 'accession', content: <TooltipClipboard>{accession}</TooltipClipboard>, gridCol: 3 },
        {
          key: 'instances',
          content: (
            <>
              <Icon
                name="group-layers"
                className={classnames('mr-2 inline-flex w-4', {
                  'text-primary-active': isExpanded,
                  'text-secondary-light': !isExpanded,
                })}
              />
              {instances}
            </>
          ),
          title: (instances || 0).toString(),
          gridCol: 2,
        },
      ],
      expandedContent: (
        <StudyListExpandedRow
          seriesTableColumns={{
            description: t('StudyList:Description'),
            seriesNumber: t('StudyList:Series'),
            modality: t('StudyList:Modality'),
            instances: t('StudyList:Instances'),
          }}
          seriesTableDataSource={
            seriesInStudiesMap.has(studyInstanceUid)
              ? seriesInStudiesMap.get(studyInstanceUid).map(s => ({
                  description: s.description || '(empty)',
                  seriesNumber: s.seriesNumber ?? '',
                  modality: s.modality || '',
                  instances: s.numSeriesInstances || '',
                }))
              : []
          }
        >
          <div className="flex flex-row gap-2">
            {(appConfig.groupEnabledModesFirst
              ? appConfig.loadedModes.sort((a, b) => {
                  const isValidA = a.isValidMode({ modalities: modalities.replaceAll('/', '\\'), study }).valid;
                  const isValidB = b.isValidMode({ modalities: modalities.replaceAll('/', '\\'), study }).valid;
                  return isValidB - isValidA;
                })
              : appConfig.loadedModes
            ).map((mode, i) => {
              const modalitiesToCheck = modalities.replaceAll('/', '\\');
              const { valid: isValidMode, description: invalidModeDescription } = mode.isValidMode({
                modalities: modalitiesToCheck,
                study,
              });

              // Preserve all current query parameters and hash
              const currentParams = new URLSearchParams(window.location.search);
              if (filterValues.configUrl) {
                currentParams.set('configUrl', filterValues.configUrl);
              }
              currentParams.set('StudyInstanceUIDs', studyInstanceUid);
              const queryString = currentParams.toString();
              const currentHash = window.location.hash || '';

              return (
                mode.displayName && (
                  <Link
                    className={isValidMode ? '' : 'cursor-not-allowed'}
                    key={i}
                    to={{
                      pathname: `${dataPath ? '../../' : ''}${mode.routeName}${dataPath || ''}`,
                      search: queryString,
                      hash: currentHash,
                    }}
                    onClick={event => {
                      if (!isValidMode) {
                        event.preventDefault();
                      }
                    }}
                  >
                    <Button
                      type={ButtonEnums.type.primary}
                      size={ButtonEnums.size.medium}
                      disabled={!isValidMode}
                      startIconTooltip={
                        !isValidMode ? (
                          <div className="font-inter flex w-[206px] whitespace-normal text-left text-xs font-normal text-white">
                            {invalidModeDescription}
                          </div>
                        ) : null
                      }
                      startIcon={
                        <Icon
                          className="!h-[20px] !w-[20px] text-black"
                          name={isValidMode ? 'launch-arrow' : 'launch-info'}
                        />
                      }
                      onClick={() => {}}
                      dataCY={`mode-${mode.routeName}-${studyInstanceUid}`}
                      className={isValidMode ? 'text-[13px]' : 'bg-[#222d44] text-[13px]'}
                    >
                      {mode.displayName}
                    </Button>
                  </Link>
                )
              );
            })}
          </div>
        </StudyListExpandedRow>
      ),
      onClickRow: () => setExpandedRows(s => (isExpanded ? s.filter(n => rowKey !== n) : [...s, rowKey])),
      isExpanded,
    };
  });

  const hasStudies = numOfStudies > 0;
  const versionNumber = process.env.VERSION_NUMBER;
  const commitHash = process.env.COMMIT_HASH;

  const menuOptions = [
    {
      title: t('Header:About'),
      icon: 'info',
      onClick: () =>
        show({
          content: AboutModal,
          title: t('AboutModal:About OHIF Viewer'),
          contentProps: { versionNumber, commitHash },
          containerDimensions: 'max-w-4xl max-h-4xl',
        }),
    },
    {
      title: t('Header:Preferences'),
      icon: 'settings',
      onClick: () =>
        show({
          title: t('UserPreferencesModal:User preferences'),
          content: UserPreferences,
          contentProps: {
            hotkeyDefaults: hotkeysManager?.getValidHotkeyDefinitions?.(hotkeyDefaults) || hotkeyDefaults,
            hotkeyDefinitions,
            onCancel: hide,
            currentLanguage: currentLanguage(),
            availableLanguages,
            defaultLanguage,
            onSubmit: state => {
              if (state.language.value !== currentLanguage().value) {
                i18n.changeLanguage(state.language.value);
              }
              hotkeysManager?.setHotkeys?.(state.hotkeyDefinitions);
              hide();
            },
            onReset: () => hotkeysManager?.restoreDefaultBindings?.(),
            hotkeysModule: hotkeys,
          },
        }),
    },
  ];

  if (appConfig.oidc) {
    menuOptions.push({
      icon: 'power-off',
      title: t('Header:Logout'),
      onClick: () => navigate(`/logout?redirect_uri=${encodeURIComponent(window.location.href)}`),
    });
  }

  const { customizationService } = servicesManager.services;
  const { component: dicomUploadComponent } = customizationService.get('dicomUploadComponent') ?? {};
  const uploadProps =
    dicomUploadComponent && dataSource.getConfig()?.dicomUploadEnabled
      ? {
          title: 'Upload files',
          closeButton: true,
          shouldCloseOnEsc: false,
          shouldCloseOnOverlayClick: false,
          content: dicomUploadComponent.bind(null, {
            dataSource,
            onComplete: () => {
              hide();
              onRefresh();
            },
            onStarted: () => {
              show({ ...uploadProps, closeButton: false });
            },
          }),
        }
      : undefined;

  const { component: dataSourceConfigurationComponent } =
    customizationService.get('ohif.dataSourceConfigurationComponent') ?? {};

  return (
    <div className="flex h-screen flex-col bg-black">
      <Header
        isSticky
        menuOptions={menuOptions}
        isReturnEnabled={false}
        WhiteLabeling={appConfig.whiteLabeling}
        showPatientInfo={PatientInfoVisibility.DISABLED}
      />
      <Onboarding />
      <InvestigationalUseDialog dialogConfiguration={appConfig?.investigationalUseDialog} />
      <div className="ohif-scrollbar ohif-scrollbar-stable-gutter flex grow flex-col overflow-y-auto sm:px-5">
        <StudyListFilter
          numOfStudies={pageNumber * resultsPerPage > 100 ? 101 : numOfStudies}
          filtersMeta={filtersMeta}
          filterValues={{ ...filterValues, ...defaultSortValues }}
          onChange={setFilterValues}
          clearFilters={() => setFilterValues(defaultFilterValues)}
          isFiltering={isFiltering(filterValues, defaultFilterValues)}
          onUploadClick={uploadProps ? () => show(uploadProps) : undefined}
          getDataSourceConfigurationComponent={
            dataSourceConfigurationComponent ? () => dataSourceConfigurationComponent() : undefined
          }
        />
        {hasStudies ? (
          <div className="flex grow flex-col">
            <StudyListTable
              tableDataSource={tableDataSource.slice(offset, offsetAndTake)}
              numOfStudies={numOfStudies}
              querying={querying}
              filtersMeta={filtersMeta}
            />
            <div className="grow">
              <StudyListPagination
                onChangePage={onPageNumberChange}
                onChangePerPage={onResultsPerPageChange}
                currentPage={pageNumber}
                perPage={resultsPerPage}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center pt-48">
            {appConfig.showLoadingIndicator && isLoadingData ? (
              <LoadingIndicatorProgress className="h-full w-full bg-black" />
            ) : (
              <EmptyStudies />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

WorkList.propTypes = {
  data: PropTypes.array.isRequired,
  dataSource: PropTypes.shape({
    query: PropTypes.object.isRequired,
    getConfig: PropTypes.func,
  }).isRequired,
  isLoadingData: PropTypes.bool.isRequired,
  servicesManager: PropTypes.object.isRequired,
  hotkeysManager: PropTypes.object,
};

const defaultFilterValues = {
  patientName: '',
  mrn: '',
  studyDate: { startDate: null, endDate: null },
  description: '',
  modalities: [],
  accession: '',
  sortBy: '',
  sortDirection: 'none',
  pageNumber: 1,
  resultsPerPage: 25,
  datasources: '',
  configUrl: null,
};

function _tryParseInt(str: string, defaultValue: any) {
  let retValue = defaultValue;
  if (str && str.length > 0 && !isNaN(str as any)) {
    retValue = parseInt(str);
  }
  return retValue;
}

function _getQueryFilterValues(params: URLSearchParams) {
  const newParams = new URLSearchParams();
  for (const [key, value] of params) {
    newParams.set(key.toLowerCase(), value);
  }
  params = newParams;

  const queryFilterValues = {
    patientName: params.get('patientname'),
    mrn: params.get('mrn'),
    studyDate: {
      startDate: params.get('startdate') || null,
      endDate: params.get('enddate') || null,
    },
    description: params.get('description'),
    modalities: params.get('modalities') ? params.get('modalities').split(',') : [],
    accession: params.get('accession'),
    sortBy: params.get('sortby'),
    sortDirection: params.get('sortdirection'),
    pageNumber: _tryParseInt(params.get('pagenumber'), undefined),
    resultsPerPage: _tryParseInt(params.get('resultsperpage'), undefined),
    datasources: params.get('datasources'),
    configUrl: params.get('configurl'),
  };

  Object.keys(queryFilterValues).forEach(key => queryFilterValues[key] == null && delete queryFilterValues[key]);

  return queryFilterValues;
}

function _sortStringDates(s1: any, s2: any, sortModifier: number) {
  const s1Date = moment(s1.date, ['YYYYMMDD', 'YYYY.MM.DD'], true);
  const s2Date = moment(s2.date, ['YYYYMMDD', 'YYYY.MM.DD'], true);

  if (s1Date.isValid() && s2Date.isValid()) {
    return (s1Date.toISOString() > s2Date.toISOString() ? 1 : -1) * sortModifier;
  } else if (s1Date.isValid()) {
    return sortModifier;
  } else if (s2Date.isValid()) {
    return -1 * sortModifier;
  }
}

export default WorkList;

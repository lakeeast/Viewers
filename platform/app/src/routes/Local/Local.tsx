import React, { useEffect, useState, useRef } from 'react';
import classnames from 'classnames';
import { useNavigate } from 'react-router-dom';
import { DicomMetadataStore, MODULE_TYPES } from '@ohif/core';
import Dropzone, { DropzoneRef } from 'react-dropzone';
import filesToStudies from './filesToStudies';
import { extensionManager } from '../../App.tsx';
import { Icon, Button, LoadingIndicatorProgress } from '@ohif/ui';

const fetchBlobs = async (objectUrls: string[]) => {
  return await Promise.all(
    objectUrls.map(async (url: string) => {
      const response = await fetch(url);
      const blob = await response.blob();
      return blob;
    })
  );
};

const getLoadButton = (onDrop: any, text: string, isDir: boolean) => {
  return (
    <Dropzone onDrop={onDrop} noDrag>
      {({ getRootProps, getInputProps }) => (
        <div {...getRootProps()}>
          <Button
            rounded="full"
            variant="contained"
            disabled={false}
            endIcon={<Icon name="launch-arrow" />}
            className={classnames('font-medium', 'ml-2')}
          >
            {text}
            <input
              {...getInputProps()}
              {...(isDir ? { directory: '', webkitdirectory: '' } : {})}
            />
          </Button>
        </div>
      )}
    </Dropzone>
  );
};

type LocalProps = {
  modePath: string;
};

function Local({ modePath }: LocalProps) {
  const navigate = useNavigate();
  const dropzoneRef = useRef<DropzoneRef>(null);
  const [dropInitiated, setDropInitiated] = useState(false);

  // Initializing the dicom local dataSource
  const dataSourceModules = extensionManager.modules[MODULE_TYPES.DATA_SOURCE];
  const localDataSources = dataSourceModules.reduce((acc: any[], curr: any) => {
    const mods = curr.module.filter((mod: any) => mod.type === 'localApi');
    return acc.concat(mods);
  }, []);
  const firstLocalDataSource = localDataSources[0];
  const dataSource = firstLocalDataSource?.createDataSource({});

  const microscopyExtensionLoaded = extensionManager.registeredExtensionIds.includes(
    '@ohif/extension-dicom-microscopy'
  );

  const onDrop = async (acceptedFiles: any[]) => {
    const studies = await filesToStudies(acceptedFiles, dataSource);
    const query = new URLSearchParams();

    if (microscopyExtensionLoaded) {
      const smStudies = studies.filter((id: string) => {
        const study = DicomMetadataStore.getStudy(id);
        return (
          study.series.findIndex(
            (s: any) => s.Modality === 'SM' || s.instances[0].Modality === 'SM'
          ) >= 0
        );
      });

      if (smStudies.length > 0) {
        smStudies.forEach(id => query.append('StudyInstanceUIDs', id));
        modePath = 'microscopy';
      }
    }

    studies.forEach(id => query.append('StudyInstanceUIDs', id));
    query.append('datasources', 'dicomlocal');
    navigate(`/${modePath}?${query.toString()}`);
  };

  // Handle messages and viewerReady logic
  useEffect(() => {
    const handlePostMessage = async (event: MessageEvent) => {
      if (event.data.type !== 'ohifReady') {
        const blobs = event.data;
        const objectUrls = blobs.map((blob: Blob) => URL.createObjectURL(blob));
        localStorage.setItem('ohifBlobCollection', JSON.stringify(objectUrls));
        const fullUrl = `${window.location.origin}/local?nativeViewer=true`;
        setTimeout(() => window.open(fullUrl, '_blank'), 1000);
      }
    };

    const urlParams = new URLSearchParams(window.location.search);
    const nativeViewer = urlParams.get('nativeViewer');

    if (nativeViewer === 'true') {
      const objectUrls = JSON.parse(localStorage.getItem('ohifBlobCollection') || '[]');
      if (objectUrls.length > 0) {
        fetchBlobs(objectUrls).then(onDrop);
      }
    } else {
      window.addEventListener('message', handlePostMessage);
      window.top.postMessage({ type: 'ohifReady' }, '*');
    }

    return () => window.removeEventListener('message', handlePostMessage);
  }, []);

  return (
    <Dropzone
      ref={dropzoneRef}
      onDrop={acceptedFiles => {
        setDropInitiated(true);
        onDrop(acceptedFiles);
      }}
      noClick
    >
      {({ getRootProps }) => (
        <div {...getRootProps()} style={{ width: '100%', height: '100%' }}>
          <div className="flex h-screen w-screen items-center justify-center">
            <div className="bg-secondary-dark mx-auto space-y-2 rounded-lg py-8 px-8 drop-shadow-md">
              {dropInitiated ? (
                <LoadingIndicatorProgress className="h-full w-full bg-black" />
              ) : (
                <div className="space-y-2">
                  <p className="text-base text-blue-300">
                    Your data is not uploaded to any server, it will stay in your local browser.
                  </p>
                  <p className="text-lg text-primary-active pt-6 font-semibold">
                    Drag and Drop DICOM files here to load them in the Viewer
                  </p>
                </div>
              )}
              <div className="flex justify-around pt-4">
                {getLoadButton(onDrop, 'Load files', false)}
                {getLoadButton(onDrop, 'Load folders', true)}
              </div>
            </div>
          </div>
        </div>
      )}
    </Dropzone>
  );
}

export default Local;

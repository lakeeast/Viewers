import React, { useEffect, useState, useRef } from 'react';
import classnames from 'classnames';
import { useNavigate } from 'react-router-dom';
import { DicomMetadataStore, MODULE_TYPES } from '@ohif/core';

import Dropzone from 'react-dropzone';
import filesToStudies from './filesToStudies';

import { extensionManager } from '../../App.tsx';

import { Icon, Button, LoadingIndicatorProgress } from '@ohif/ui';

const getLoadButton = (onDrop, text, isDir) => {
  return (
    <Dropzone
      onDrop={onDrop}
      noDrag
    >
      {({ getRootProps, getInputProps }) => (
        <div {...getRootProps()}>
          <Button
            rounded="full"
            variant="contained" // outlined
            disabled={false}
            endIcon={<Icon name="launch-arrow" />} // launch-arrow | launch-info
            className={classnames('font-medium', 'ml-2')}
            onClick={() => {}}
          >
            {text}
            {isDir ? (
              <input
                {...getInputProps()}
                webkitdirectory="true"
                mozdirectory="true"
              />
            ) : (
              <input {...getInputProps()} />
            )}
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
  const dropzoneRef = useRef();
  const [dropInitiated, setDropInitiated] = useState(false);

  // Initializing the dicom local dataSource
  const dataSourceModules = extensionManager.modules[MODULE_TYPES.DATA_SOURCE];
  const localDataSources = dataSourceModules.reduce((acc, curr) => {
    const mods = [];
    curr.module.forEach(mod => {
      if (mod.type === 'localApi') {
        mods.push(mod);
      }
    });
    return acc.concat(mods);
  }, []);

  const firstLocalDataSource = localDataSources[0];
  const dataSource = firstLocalDataSource.createDataSource({});

  const microscopyExtensionLoaded = extensionManager.registeredExtensionIds.includes(
    '@ohif/extension-dicom-microscopy'
  );

  const onDrop = async (acceptedFiles) => {
    const studies = await filesToStudies(acceptedFiles, dataSource);

    const query = new URLSearchParams();

    if (microscopyExtensionLoaded) {
      const smStudies = studies.filter(id => {
        const study = DicomMetadataStore.getStudy(id);
        return (
          study.series.findIndex(s => s.Modality === 'SM' || s.instances[0].Modality === 'SM') >= 0
        );
      });

      if (smStudies.length > 0) {
        smStudies.forEach(id => query.append('StudyInstanceUIDs', id));
        modePath = 'microscopy';
      }
    }

    studies.forEach(id => query.append('StudyInstanceUIDs', id));
    query.append('datasources', 'dicomlocal');

    navigate(`/${modePath}?${decodeURIComponent(query.toString())}`);
  };

  // Set body style
  useEffect(() => {
    document.body.classList.add('bg-black');
    return () => {
      document.body.classList.remove('bg-black');
    };
  }, []);

  // Step 1: Send 'viewerReady' message to the parent (Angular) window when the React page is loaded
  useEffect(() => {
    // Send the 'viewerReady' message to the parent window
    window.top.postMessage({type: 'ohifReady'}, '*');
    console.log(`Sent ohifReady message to parent`);

    // Step 2: Listen for messages from the Angular application (parent window)
    const handlePostMessage = (event) => {
      // You may want to validate the origin of the event for security purposes
      // if (event.origin !== 'expected-origin') return;
      console.log(`Received message from parent`);
      const blobs = event.data;
    };

    // Add event listener for postMessage
    window.addEventListener('message', handlePostMessage);

    // Cleanup on component unmount
    return () => {
      window.removeEventListener('message', handlePostMessage);
    };
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
        <div
          {...getRootProps()}
          style={{ width: '100%', height: '100%' }}
        >
          <div className="flex h-screen w-screen items-center justify-center ">
            <div className="bg-secondary-dark mx-auto space-y-2 rounded-lg py-8 px-8 drop-shadow-md">
              <div className="flex items-center justify-center">
                <Icon
                  name="logo-dark-background"
                  className="h-28"
                />
              </div>
              <div className="space-y-2 pt-4 text-center">
                {dropInitiated ? (
                  <div className="flex flex-col items-center justify-center pt-48">
                    <LoadingIndicatorProgress className={'h-full w-full bg-black'} />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-base text-blue-300">
                      Note: You data is not uploaded to any server, it will stay in your local
                      browser application
                    </p>
                    <p className="text-xg text-primary-active pt-6 font-semibold">
                      Drag and Drop DICOM files here to load them in the Viewer
                    </p>
                    <p className="text-lg text-blue-300">Or click to </p>
                  </div>
                )}
              </div>
              <div className="flex justify-around pt-4 ">
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

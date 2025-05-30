import React, { useState, useEffect } from 'react';
import { 
  Download, 
  Upload, 
  CheckCircle, 
  AlertCircle, 
  Play, 
  FileText,
  Monitor,
  Settings,
  ArrowRight,
  ExternalLink
} from 'lucide-react';
import Toast from './Toast';

const VMSetup = ({ setupInfo, onComplete }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [setupStatus, setSetupStatus] = useState(null);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
  };

  const hideToast = () => {
    setToast({ show: false, message: '', type: 'success' });
  };

  // Fetch setup status on component mount
  useEffect(() => {
    fetchSetupStatus();
  }, []);

  const fetchSetupStatus = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/vm/setup/status', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setSetupStatus(data);
        
        // Determine current step based on setup status
        if (data.setupStatus?.status === 'setup_in_progress') {
          setCurrentStep(2);
        } else if (data.setupStatus?.status === 'file_uploaded') {
          setCurrentStep(3);
        } else if (data.setupStatus?.status === 'completed') {
          setCurrentStep(4);
        }
      }
    } catch (error) {
      console.error('Error fetching setup status:', error);
    }
  };

  const initiateSetup = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/vm/setup/initiate', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setSetupStatus(data);
        setCurrentStep(2);
        showToast('Setup initiated successfully!', 'success');
      } else {
        const error = await response.json();
        showToast(error.error || 'Failed to initiate setup', 'error');
      }
    } catch (error) {
      showToast('Network error. Please try again.', 'error');
    }
  };

  const handleFileUpload = async () => {
    if (!uploadFile) {
      showToast('Please select a file to upload', 'error');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('hwhoFile', uploadFile);

      const token = localStorage.getItem('token');
      const response = await fetch('/api/vm/setup/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (response.ok) {
        const data = await response.json();
        setSetupStatus(data);
        setCurrentStep(3);
        showToast('File uploaded and distributed to VMs successfully!', 'success');
      } else {
        const error = await response.json();
        showToast(error.error || 'Failed to upload file', 'error');
      }
    } catch (error) {
      showToast('Network error during upload. Please try again.', 'error');
    } finally {
      setUploading(false);
    }
  };

  const completeSetup = async () => {
    setCompleting(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/vm/setup/complete', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setSetupStatus(data);
        setCurrentStep(4);
        showToast('Setup completed! Your VMs are now running the automation.', 'success');
        
        // Notify parent component
        if (onComplete) {
          onComplete();
        }
      } else {
        const error = await response.json();
        showToast(error.error || 'Failed to complete setup', 'error');
      }
    } catch (error) {
      showToast('Network error. Please try again.', 'error');
    } finally {
      setCompleting(false);
    }
  };

  const steps = [
    {
      id: 1,
      title: 'Download HWHO Application',
      description: 'Download and install the HWHO application on your local machine',
      icon: Download
    },
    {
      id: 2,
      title: 'Configure HWHO',
      description: 'Set up the HWHO application and generate your configuration file',
      icon: Settings
    },
    {
      id: 3,
      title: 'Upload Configuration',
      description: 'Upload your hwho.dat file to configure your VMs',
      icon: Upload
    },
    {
      id: 4,
      title: 'Complete Setup',
      description: 'Finalize setup and start automation on your VMs',
      icon: CheckCircle
    }
  ];

  const planTypeDisplayNames = {
    'hour_booster': 'Hour Booster',
    'dual_mode': 'Dual Mode',
    'kd_drop': 'KD Drop'
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <Toast 
        show={toast.show} 
        message={toast.message} 
        type={toast.type} 
        onClose={hideToast} 
      />

      {/* Header */}
      <div className="text-center mb-8">
        <div className="flex items-center justify-center mb-4">
          <div className="h-16 w-16 bg-primary-100 dark:bg-primary-900 rounded-full flex items-center justify-center">
            <Monitor className="h-8 w-8 text-primary-600 dark:text-primary-400" />
          </div>
        </div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          VM Setup Wizard
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Set up your {setupInfo?.vmCount || 'new'} VM{(setupInfo?.vmCount || 1) > 1 ? 's' : ''} for {planTypeDisplayNames[setupInfo?.planType] || 'your plan'}
        </p>
      </div>

      {/* Progress Steps */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {steps.map((step, index) => {
            const isActive = currentStep === step.id;
            const isCompleted = currentStep > step.id;
            const Icon = step.icon;

            return (
              <div key={step.id} className="flex items-center">
                <div className={`
                  flex items-center justify-center w-12 h-12 rounded-full border-2 transition-all duration-200
                  ${isCompleted 
                    ? 'bg-green-500 border-green-500 text-white' 
                    : isActive 
                    ? 'bg-primary-500 border-primary-500 text-white' 
                    : 'bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-400'
                  }
                `}>
                  <Icon className="h-6 w-6" />
                </div>
                {index < steps.length - 1 && (
                  <div className={`
                    w-16 h-1 mx-2 transition-all duration-200
                    ${currentStep > step.id ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-600'}
                  `} />
                )}
              </div>
            );
          })}
        </div>
        <div className="flex justify-between mt-4">
          {steps.map((step) => (
            <div key={step.id} className="text-center max-w-32">
              <p className={`
                text-sm font-medium transition-colors duration-200
                ${currentStep >= step.id ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}
              `}>
                {step.title}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Step Content */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-8">
        {currentStep === 1 && (
          <div className="text-center">
            <Download className="h-16 w-16 text-primary-500 mx-auto mb-6" />
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              Download HWHO Application
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-2xl mx-auto">
              First, you'll need to download and install the HWHO application on your local machine. 
              This application will help you configure the automation settings for your VMs.
            </p>
            
            <div className="bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-700 rounded-lg p-6 mb-6">
              <div className="flex items-start">
                <FileText className="h-6 w-6 text-blue-600 dark:text-blue-400 mr-3 mt-1" />
                <div className="text-left">
                  <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
                    Quick Setup Guide
                  </h3>
                  <ol className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
                    <li>1. Download the HWHO application from the official source</li>
                    <li>2. Install and run the application</li>
                    <li>3. Configure your settings according to your {planTypeDisplayNames[setupInfo?.planType] || 'plan'} requirements</li>
                    <li>4. Generate the hwho.dat configuration file</li>
                  </ol>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href="#"
                className="inline-flex items-center px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition-colors duration-200"
              >
                <Download className="h-5 w-5 mr-2" />
                Download HWHO
                <ExternalLink className="h-4 w-4 ml-2" />
              </a>
              <button
                onClick={initiateSetup}
                className="inline-flex items-center px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors duration-200"
              >
                I've Downloaded HWHO
                <ArrowRight className="h-5 w-5 ml-2" />
              </button>
            </div>
          </div>
        )}

        {currentStep === 2 && (
          <div className="text-center">
            <Settings className="h-16 w-16 text-primary-500 mx-auto mb-6" />
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              Configure HWHO Application
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-2xl mx-auto">
              Now configure the HWHO application with your specific settings and generate the configuration file.
            </p>

            <div className="bg-yellow-50 dark:bg-yellow-900 border border-yellow-200 dark:border-yellow-700 rounded-lg p-6 mb-6">
              <div className="flex items-start">
                <AlertCircle className="h-6 w-6 text-yellow-600 dark:text-yellow-400 mr-3 mt-1" />
                <div className="text-left">
                  <h3 className="font-semibold text-yellow-900 dark:text-yellow-100 mb-2">
                    {planTypeDisplayNames[setupInfo?.planType] || 'Plan'} Configuration
                  </h3>
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    Make sure to configure HWHO for the {planTypeDisplayNames[setupInfo?.planType] || 'selected'} plan type. 
                    Your VMs have been optimized for this specific configuration.
                  </p>
                </div>
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Upload hwho.dat file
              </label>
              <div className="flex items-center justify-center w-full">
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:hover:border-gray-500">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <Upload className="w-8 h-8 mb-4 text-gray-500 dark:text-gray-400" />
                    <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">
                      <span className="font-semibold">Click to upload</span> your hwho.dat file
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Only .dat files are accepted
                    </p>
                  </div>
                  <input
                    type="file"
                    className="hidden"
                    accept=".dat"
                    onChange={(e) => setUploadFile(e.target.files[0])}
                  />
                </label>
              </div>
              {uploadFile && (
                <p className="mt-2 text-sm text-green-600 dark:text-green-400">
                  Selected: {uploadFile.name}
                </p>
              )}
            </div>

            <button
              onClick={handleFileUpload}
              disabled={!uploadFile || uploading}
              className="inline-flex items-center px-6 py-3 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors duration-200"
            >
              {uploading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-white/70 border-t-white mr-2"></div>
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="h-5 w-5 mr-2" />
                  Upload Configuration
                </>
              )}
            </button>
          </div>
        )}

        {currentStep === 3 && (
          <div className="text-center">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-6" />
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              Configuration Uploaded Successfully
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-2xl mx-auto">
              Your hwho.dat file has been uploaded and distributed to all {setupInfo?.vmCount || 'your'} VMs. 
              Click the button below to complete the setup and start the automation.
            </p>

            <div className="bg-green-50 dark:bg-green-900 border border-green-200 dark:border-green-700 rounded-lg p-6 mb-6">
              <div className="flex items-center justify-center">
                <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400 mr-3" />
                <p className="text-green-800 dark:text-green-200">
                  File distributed to {setupStatus?.result?.distributedToVMs || setupInfo?.vmCount || 0} VMs
                </p>
              </div>
            </div>

            <button
              onClick={completeSetup}
              disabled={completing}
              className="inline-flex items-center px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors duration-200"
            >
              {completing ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-white/70 border-t-white mr-2"></div>
                  Completing Setup...
                </>
              ) : (
                <>
                  <Play className="h-5 w-5 mr-2" />
                  Complete Setup & Start Automation
                </>
              )}
            </button>
          </div>
        )}

        {currentStep === 4 && (
          <div className="text-center">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-6" />
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              Setup Complete!
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-2xl mx-auto">
              Congratulations! Your VMs have been successfully configured and the automation is now running. 
              You can monitor your VMs from the dashboard.
            </p>

            <div className="bg-green-50 dark:bg-green-900 border border-green-200 dark:border-green-700 rounded-lg p-6 mb-6">
              <div className="text-center">
                <h3 className="font-semibold text-green-900 dark:text-green-100 mb-2">
                  Automation Started
                </h3>
                <p className="text-sm text-green-800 dark:text-green-200">
                  {setupStatus?.result?.automationStarted || setupInfo?.vmCount || 0} VMs are now running the {planTypeDisplayNames[setupInfo?.planType] || 'selected'} automation
                </p>
              </div>
            </div>

            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition-colors duration-200"
            >
              <Monitor className="h-5 w-5 mr-2" />
              Go to VM Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default VMSetup; 
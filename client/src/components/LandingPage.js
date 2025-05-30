import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, CheckCircle, Star, ArrowRight } from 'lucide-react';

const LandingPage = () => {
  const navigate = useNavigate();

  const features = [
    {
      icon: <Clock className="h-6 w-6 text-blue-600" />,
      title: "24/7 Hour Farming",
      description: "Automated hour boosting runs continuously to maximize your in-game time efficiently."
    },
    {
      icon: <Clock className="h-6 w-6 text-green-600" />,
      title: "Secure & Private",
      description: "Your account credentials are encrypted and protected with enterprise-grade security."
    },
    {
      icon: <Clock className="h-6 w-6 text-yellow-600" />,
      title: "Fast Setup",
      description: "Get started in minutes. Simply create an account, choose your plan, and we'll handle the rest."
    },
    {
      icon: <Clock className="h-6 w-6 text-purple-600" />,
      title: "Dedicated VMs",
      description: "Each customer gets their own isolated virtual machine for optimal performance and security."
    }
  ];

  const plans = [
    {
      name: "Basic",
      price: 12,
      period: "month",
      description: "Perfect for casual players looking to boost their hours",
      features: [
        "1 Dedicated Virtual Machine",
        "24/7 Hour Farming",
        "Basic Support",
        "Secure Account Handling",
        "Monthly Billing"
      ],
      popular: false,
      buttonText: "Get Started"
    },
    {
      name: "Premium", 
      price: 20,
      period: "month",
      description: "Advanced features for serious players who want maximum efficiency",
      features: [
        "2 Dedicated Virtual Machines",
        "24/7 Hour Farming",
        "Priority Support",
        "Secure Account Handling",
        "Advanced Monitoring",
        "Custom Schedules",
        "Monthly Billing"
      ],
      popular: true,
      buttonText: "Start Premium"
    }
  ];

  const handleGetStarted = (planName) => {
    // For now, navigate to login. Later we'll add Stripe checkout
    navigate('/login', { state: { selectedPlan: planName } });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <div className="h-8 w-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <Clock className="h-5 w-5 text-white" />
              </div>
              <h1 className="ml-3 text-xl font-bold text-gray-900">
                TarkovBoost Pro
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate('/login')}
                className="text-gray-700 hover:text-gray-900 px-3 py-2 text-sm font-medium"
              >
                Sign In
              </button>
              <button
                onClick={() => handleGetStarted('Basic')}
                className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700"
              >
                Get Started
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="bg-gradient-to-br from-blue-600 to-blue-800 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
          <div className="text-center">
            <h1 className="text-4xl md:text-6xl font-bold mb-6">
              Boost Your Escape from Tarkov Hours
            </h1>
            <p className="text-xl md:text-2xl mb-8 text-blue-100 max-w-3xl mx-auto">
              Securely farm in-game hours on your Tarkov account with our automated VM-based boosting service. 
              Set up once, boost 24/7.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={() => handleGetStarted('Premium')}
                className="bg-white text-blue-600 px-8 py-4 rounded-lg text-lg font-semibold hover:bg-gray-100 transition-colors"
              >
                Start Boosting Now
              </button>
              <button
                onClick={() => document.getElementById('pricing').scrollIntoView({ behavior: 'smooth' })}
                className="border-2 border-white text-white px-8 py-4 rounded-lg text-lg font-semibold hover:bg-white hover:text-blue-600 transition-colors"
              >
                View Pricing
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Why Choose TarkovBoost Pro?
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Our professional hour boosting service combines security, reliability, and efficiency 
              to help you achieve your Tarkov goals faster.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature, index) => (
              <div key={index} className="text-center p-6 rounded-lg hover:shadow-lg transition-shadow">
                <div className="flex justify-center mb-4">
                  {feature.icon}
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">
                  {feature.title}
                </h3>
                <p className="text-gray-600">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              How It Works
            </h2>
            <p className="text-xl text-gray-600">
              Get started in just 3 simple steps
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="bg-blue-600 text-white rounded-full w-12 h-12 flex items-center justify-center text-xl font-bold mx-auto mb-4">
                1
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                Create Account & Choose Plan
              </h3>
              <p className="text-gray-600">
                Sign up for an account and select the subscription plan that fits your needs.
              </p>
            </div>
            
            <div className="text-center">
              <div className="bg-blue-600 text-white rounded-full w-12 h-12 flex items-center justify-center text-xl font-bold mx-auto mb-4">
                2
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                Securely Link Your Tarkov Account
              </h3>
              <p className="text-gray-600">
                Safely provide your account details through our encrypted system. Your credentials are never stored in plain text.
              </p>
            </div>
            
            <div className="text-center">
              <div className="bg-blue-600 text-white rounded-full w-12 h-12 flex items-center justify-center text-xl font-bold mx-auto mb-4">
                3
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                Start Your VM & Begin Farming
              </h3>
              <p className="text-gray-600">
                Launch your dedicated virtual machine and watch as your in-game hours accumulate automatically.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Simple, Transparent Pricing
            </h2>
            <p className="text-xl text-gray-600">
              Choose the plan that works best for your boosting needs
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {plans.map((plan, index) => (
              <div
                key={index}
                className={`rounded-lg p-8 ${
                  plan.popular
                    ? 'bg-blue-600 text-white ring-4 ring-blue-200 transform scale-105'
                    : 'bg-white border border-gray-200'
                }`}
              >
                {plan.popular && (
                  <div className="flex items-center justify-center mb-4">
                    <span className="bg-white text-blue-600 px-3 py-1 rounded-full text-sm font-semibold flex items-center">
                      <Star className="h-4 w-4 mr-1" />
                      Most Popular
                    </span>
                  </div>
                )}
                
                <div className="text-center mb-6">
                  <h3 className={`text-2xl font-bold mb-2 ${plan.popular ? 'text-white' : 'text-gray-900'}`}>
                    {plan.name}
                  </h3>
                  <div className="mb-4">
                    <span className={`text-4xl font-bold ${plan.popular ? 'text-white' : 'text-gray-900'}`}>
                      ${plan.price}
                    </span>
                    <span className={`text-lg ${plan.popular ? 'text-blue-100' : 'text-gray-600'}`}>
                      /{plan.period}
                    </span>
                  </div>
                  <p className={`${plan.popular ? 'text-blue-100' : 'text-gray-600'}`}>
                    {plan.description}
                  </p>
                </div>
                
                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature, featureIndex) => (
                    <li key={featureIndex} className="flex items-center">
                      <CheckCircle className={`h-5 w-5 mr-3 ${plan.popular ? 'text-blue-200' : 'text-green-500'}`} />
                      <span className={`${plan.popular ? 'text-blue-100' : 'text-gray-600'}`}>
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>
                
                <button
                  onClick={() => handleGetStarted(plan.name)}
                  className={`w-full py-3 px-6 rounded-lg font-semibold transition-colors ${
                    plan.popular
                      ? 'bg-white text-blue-600 hover:bg-gray-100'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  {plan.buttonText}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="col-span-1 md:col-span-2">
              <div className="flex items-center mb-4">
                <div className="h-8 w-8 bg-blue-600 rounded-lg flex items-center justify-center">
                  <Clock className="h-5 w-5 text-white" />
                </div>
                <h3 className="ml-3 text-xl font-bold">TarkovBoost Pro</h3>
              </div>
              <p className="text-gray-400 mb-4">
                Professional Escape from Tarkov hour boosting service. Secure, reliable, and efficient.
              </p>
              <p className="text-sm text-gray-500">
                © 2024 TarkovBoost Pro. All rights reserved.
              </p>
            </div>
            
            <div>
              <h4 className="text-lg font-semibold mb-4">Service</h4>
              <ul className="space-y-2 text-gray-400">
                <li><a href="/services/hour-boosting" className="hover:text-white transition-colors cursor-pointer">Hour Boosting</a></li>
                <li><a href="/services/vm-management" className="hover:text-white transition-colors cursor-pointer">VM Management</a></li>
                <li><a href="/services/account-security" className="hover:text-white transition-colors cursor-pointer">Account Security</a></li>
                <li><a href="/support" className="hover:text-white transition-colors cursor-pointer">24/7 Support</a></li>
              </ul>
            </div>
            
            <div>
              <h4 className="text-lg font-semibold mb-4">Support</h4>
              <ul className="space-y-2 text-gray-400">
                <li><a href="/help" className="hover:text-white transition-colors cursor-pointer">Help Center</a></li>
                <li><a href="/contact" className="hover:text-white transition-colors cursor-pointer">Contact Us</a></li>
                <li><a href="/terms" className="hover:text-white transition-colors cursor-pointer">Terms of Service</a></li>
                <li><a href="/privacy" className="hover:text-white transition-colors cursor-pointer">Privacy Policy</a></li>
              </ul>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage; 